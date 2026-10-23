// OUR CRAFTER panel (CRAFTER-2026-10-15, Discord player Vykaax: "crafter supplier"). Served by Dashboard/crafter_api.js (/crafterpanel.js|css).
// Fills two places by itself (no edits to their code beyond one empty slot each):
//   1. the Storage page box  <div id="stgCraft">  (Dashboard/storagepage.js): every Dwarf crafter, its switch, town, the parties it supplies,
//      the stock it keeps per shot, daily limits, what it has / can make / is missing, last crafts, Craft now / Read recipe book / Craft one.
//   2. the party settings popup, Supplies section  <div data-crafter-party="<leader>">  (Dashboard/partysettings.js): one plain line
//      "Our crafter X makes shots for this party" + a switch "Take shots from our crafter first" (adds / removes the party on that crafter).
// Data: GET/POST /api/crafter (Scripts/data/crafter_rules.json, read live by swarm.js CRAFT-PURE). Uses index.html globals api, esc and
// uidialog's uiConfirm / uiError. No browser alert / confirm / prompt.
(function () {
  'use strict';
  const CP = { info: null, at: 0, busy: false, edits: {}, open: new Set() };
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  const ago = (s) => s == null ? 'never' : s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago';
  const STATE = { off: 'Off', waiting: 'Waiting', stuck: 'Cannot craft', blocked: 'Cannot craft', full: 'Stock full', crafted: 'Crafted', busy: 'Busy', none: '—', error: 'Error' };
  async function load(force) {
    if (CP.busy) return CP.info; if (!force && CP.info && Date.now() - CP.at < 20000) return CP.info;
    CP.busy = true;
    try { const d = await api('/api/crafter'); if (d && !d.error) { CP.info = d; CP.at = Date.now(); } } catch (e) { } finally { CP.busy = false; }
    return CP.info;
  }
  const typing = (el) => { const a = document.activeElement; return a && el.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); };

  // ---------------------------------------------------------------------- Storage page box
  function card(c, I) {
    const cfg = c.cfg, st = c.status || {}, e = CP.edits[c.name] || {}, val = (k, d) => (k in e ? e[k] : d);
    const on = val('on', cfg.on), town = val('town', cfg.town), parties = val('parties', cfg.parties), stock = Object.assign({}, cfg.stock, val('stock', {})), daily = Object.assign({}, cfg.daily, val('daily', {}));
    const rows = obj(st.products), mats = obj(st.mats), known = Array.isArray(st.known) ? st.known : null;
    const statusRows = {}; (st.stock || []).forEach(r => { statusRows[r.key] = r; });
    const who = c.cand ? `${h(c.cand.cls)} · level ${h(c.cand.level)}` : 'not seen online';
    const sState = !cfg.exists ? 'Not set up' : (STATE[st.state] || (st.state ? h(st.state) : 'No report yet'));
    const head = `<div class="crf-top"><b>${h(c.name)}</b><span class="muted">${who}${st.createLvl ? ` · Create Item level ${h(st.createLvl)}` : ''}</span>
      <span class="crf-pill ${on ? 'on' : 'off'}">${on ? 'On' : 'Off'}</span></div>
      <div class="crf-state"><b>${sState}</b>${st.why ? ': ' + h(st.why) : ''} <span class="muted">(${ago(st.ageSec)}${st.town ? ', in ' + h(st.town) : ''})</span></div>`;
    const sw = `<label class="crf-sw"><input type="checkbox" data-crf="${h(c.name)}" data-k="on"${on ? ' checked' : ''}> <span>${on ? `On — ${h(c.name)} crafts shots while it stands in ${h(town)} and gives them to the parties below in their supply runs` : 'Off — nothing happens until you switch it on'}</span></label>`;
    const townSel = `<label class="crf-f">Where it waits and crafts <select data-crf="${h(c.name)}" data-k="town">${I.towns.map(t => `<option${t === town ? ' selected' : ''}>${h(t)}</option>`).join('')}</select></label>`;
    const all = parties.includes('*');
    const pts = `<div class="crf-f">Parties it supplies <span class="muted">(they take shots from it first, then the shop NPC, then player shops)</span>
      <div class="crf-chips"><label><input type="checkbox" data-crf="${h(c.name)}" data-party="*"${all ? ' checked' : ''}> Every party</label>
      ${(I.parties || []).filter(p => p.leader !== c.name).map(p => `<label><input type="checkbox" data-crf="${h(c.name)}" data-party="${h(p.leader)}"${all || parties.includes(p.leader) ? ' checked' : ''}${all ? ' disabled' : ''}> party ${h(p.leader)}</label>`).join('')}</div></div>`;
    const kinds = Object.keys(I.kinds);
    const tbl = `<div class="crf-tbl"><div class="crf-tr crf-th"><span>Shot</span><span>Has</span><span>Keep in stock</span><span>Status</span></div>
      ${kinds.map(k => I.grades.map(g => { const key = `${k}:${g}`, r = I.recipes.find(x => x.key === key); if (!r) return '';
        const sr = statusRows[key], has = rows[r.product], learned = known ? known.includes(key) : null;
        const lvlOk = st.createLvl ? st.createLvl >= r.lvl : null;
        const note = sr ? sr.text.replace(/^[^:]+: /, '') : lvlOk === false ? `needs Create Item level ${r.lvl}` : learned === false ? 'recipe not learned' : '';
        return `<div class="crf-tr"><span>${h(r.name)}</span><span>${has == null ? '?' : fmt(has)}</span>
          <span><input type="number" min="0" step="100" inputmode="numeric" placeholder="not made" value="${stock[key] ? h(stock[key]) : ''}" data-crf="${h(c.name)}" data-stock="${h(key)}"></span>
          <span class="crf-note">${h(note)}</span></div>`; }).join('')).join('')}</div>`;
    const matLine = Object.keys(I.mats).map(id => `${h(I.mats[id])} <b>${mats[id] == null ? '?' : fmt(mats[id])}</b>`).join(' · ');
    const used = obj(st.used), lim = `<details class="crf-more"><summary>Daily limits (crystals / ore it may use per day)</summary><div class="crf-lims">
      ${I.grades.map(g => `<label>${g} crystals <input type="number" min="0" inputmode="numeric" placeholder="no limit" value="${daily[g] ? h(daily[g]) : ''}" data-crf="${h(c.name)}" data-daily="${g}"> <span class="muted">used today ${fmt(used[{ D: 1458, C: 1459, B: 1460, A: 1461, S: 1462 }[g]] || 0)}</span></label>`).join('')}
      <label>Soul Ore <input type="number" min="0" inputmode="numeric" placeholder="no limit" value="${daily.soulOre ? h(daily.soulOre) : ''}" data-crf="${h(c.name)}" data-daily="soulOre"> <span class="muted">used today ${fmt(used[1785] || 0)}</span></label>
      <label>Spirit Ore <input type="number" min="0" inputmode="numeric" placeholder="no limit" value="${daily.spiritOre ? h(daily.spiritOre) : ''}" data-crf="${h(c.name)}" data-daily="spiritOre"> <span class="muted">used today ${fmt(used[3031] || 0)}</span></label>
      <label>Crafts per round <input type="number" min="1" max="200" inputmode="numeric" placeholder="${h(I.defaults.maxBatches)}" value="${val('maxBatches', cfg.exists && obj(obj(I.data.crafters)[c.name]).maxBatches) || ''}" data-crf="${h(c.name)}" data-k="maxBatches"></label>
      <label class="crf-sw"><input type="checkbox" data-crf="${h(c.name)}" data-k="learn"${val('learn', cfg.learn) ? ' checked' : ''}> <span>Learn a missing shot recipe from a recipe scroll in its bag (uses up the scroll)</span></label>
      </div></details>`;
    const last = (st.last || []).slice(-5).reverse().map(x => `<li>${h(String(x.at || '').slice(5, 16).replace('T', ' '))} — ${h(x.key)}: made ${fmt(x.made)}${x.why ? ' (' + h(x.why) + ')' : ''}</li>`).join('');
    const dirty = Object.keys(e).length > 0;
    return `<div class="crf-card" data-crfcard="${h(c.name)}">${head}${sw}${townSel}${pts}${tbl}
      <div class="crf-mats"><span class="muted">It has:</span> ${matLine}</div>
      <div class="muted crf-hint">It never crystallizes anything by itself — it uses the crystals and ore it already has and says what is missing. Turning items into crystals happens only when you tick them under "Items" and confirm.</div>
      ${lim}${last ? `<details class="crf-more"><summary>Last crafts</summary><ul class="crf-last">${last}</ul></details>` : ''}
      <div class="crf-acts"><button type="button" class="uk-btn${dirty ? '' : ' secondary'}" data-crfact="save" data-name="${h(c.name)}"${dirty ? '' : ' disabled'}>Save</button>
        <button type="button" class="uk-btn ghost" data-crfact="undo" data-name="${h(c.name)}"${dirty ? '' : ' disabled'}>Undo</button>
        <button type="button" class="uk-btn secondary" data-crfact="craft" data-name="${h(c.name)}">Craft now</button>
        <button type="button" class="uk-btn ghost" data-crfact="book" data-name="${h(c.name)}">Read recipe book</button>
        <button type="button" class="uk-btn ghost" data-crfact="one" data-name="${h(c.name)}">Craft one batch…</button>
        ${cfg.exists ? `<button type="button" class="uk-btn ghost crf-del" data-crfact="remove" data-name="${h(c.name)}">Remove this crafter</button>` : ''}</div>${itemsHtml(c, I)}</div>`;
  }
  function renderBox(el) {
    const I = CP.info;
    if (!I) { el.innerHTML = '<div class="muted">Loading… (if this stays, the dashboard server needs a restart for the crafter API)</div>'; return; }
    const list = I.crafters || [];
    if (!list.length) { el.innerHTML = `<div class="muted">No crafter yet. A Dwarf Artisan, Warsmith or Maestro can make soulshots and spiritshots for your parties from crystals and Soul / Spirit Ore. When one logs in it shows up here.</div>`; return; }
    el.innerHTML = `<div class="crf-hint muted">Your crafter stays in town, keeps the shots you choose in stock and hands them to the parties you tick in their supply runs — before anything is bought.</div>` +
      list.map(c => CP.open.has(c.name) || list.length === 1 || c.cfg.exists ? card(c, I) : `<div class="crf-card crf-closed"><b>${h(c.name)}</b> <span class="muted">${c.cand ? h(c.cand.cls) + ' · level ' + h(c.cand.level) : ''}</span> <button type="button" class="uk-btn ghost" data-crfact="setup" data-name="${h(c.name)}">Make this my crafter</button></div>`).join('') +
      '<div class="cpl-msg" id="crfMsg" hidden></div>';
  }
  function msg(t, bad) { const m = document.getElementById('crfMsg'); if (!m) return; m.hidden = !t; m.className = 'cpl-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; setTimeout(() => { if (m) m.hidden = true; }, 8000); }
  function edit(name, k, v) { const e = CP.edits[name] = CP.edits[name] || {}; e[k] = v; }
  function onInput(ev) {
    const t = ev.target, n = t && t.dataset && t.dataset.crf; if (!n || !CP.info) return;
    const c = (CP.info.crafters || []).find(x => x.name === n); if (!c) return;
    if (t.dataset.k === 'on' || t.dataset.k === 'learn') edit(n, t.dataset.k, !!t.checked);
    else if (t.dataset.k === 'town') edit(n, 'town', t.value);
    else if (t.dataset.k === 'maxBatches') edit(n, 'maxBatches', t.value === '' ? null : Number(t.value));
    else if (t.dataset.stock) { const s = Object.assign({}, (CP.edits[n] || {}).stock); s[t.dataset.stock] = t.value === '' ? null : Number(t.value); edit(n, 'stock', s); }
    else if (t.dataset.daily) { const s = Object.assign({}, (CP.edits[n] || {}).daily); s[t.dataset.daily] = t.value === '' ? null : Number(t.value); edit(n, 'daily', s); }
    else if (t.dataset.party) {
      const cur = ((CP.edits[n] || {}).parties || c.cfg.parties).filter(x => x !== t.dataset.party);
      if (t.checked) cur.push(t.dataset.party);
      edit(n, 'parties', t.dataset.party === '*' && t.checked ? ['*'] : cur.filter(x => x !== '*' || t.dataset.party === '*'));
    } else return;
    if (ev.type === 'change') { const box = document.getElementById('stgCraft'); if (box && !/^(number|text)$/.test(t.type)) renderBox(box); else { const b = document.querySelector(`[data-crfact="save"][data-name="${CSS.escape(n)}"]`); if (b) { b.disabled = false; b.classList.remove('secondary'); } const u = document.querySelector(`[data-crfact="undo"][data-name="${CSS.escape(n)}"]`); if (u) u.disabled = false; } }
  }
  async function save(name, values) {
    const d = await api('/api/crafter', { method: 'POST', body: JSON.stringify({ name, values, rev: CP.info ? CP.info.rev : undefined }) });
    if (!d || d.error) { if (typeof uiError === 'function') await uiError(`Not saved: ${(d && d.error) || 'no answer'}`); return false; }
    return true;
  }
  async function cmd(c, name) {
    try { const d = await api('/api/command', { method: 'POST', body: JSON.stringify({ cmd: c, targets: ['char:' + name] }) }); if (!d || d.error) { if (typeof uiError === 'function') await uiError(`${c}: ${(d && d.error) || 'no answer'}`); return false; } return true; }
    catch (e) { if (typeof uiError === 'function') await uiError(`${c}: ${e.message}`); return false; }
  }
  async function onClick(ev) {
    const b = ev.target.closest && ev.target.closest('[data-crfact]'); if (!b) return;
    if (b.disabled) return;
    if (b.dataset.crfact === 'grade') { CI.grade[b.dataset.name] = b.dataset.g || ''; reBox(); return; }   // CRFGRADE-2026-10-23
    try { if (await itemsClick(b)) return; } catch (e) { if (typeof uiError === 'function') await uiError(String(e && e.message || e)); return; }   // CRAFTITEMS-2026-10-15
    const n = b.dataset.name, a = b.dataset.crfact, box = document.getElementById('stgCraft');
    if (a === 'setup') { CP.open.add(n); if (box) renderBox(box); return; }
    if (a === 'undo') { delete CP.edits[n]; if (box) renderBox(box); return; }
    // CRFREMOVE-2026-10-23 (public tester 1.8.17: "storage tab - can't delete crafter1 char"): a crafter entry (also one of a character that is
    // gone) can be removed; the API already took { remove: true }, the panel had no button for it
    if (a === 'remove') {
      if (typeof uiConfirm !== 'function' || !(await uiConfirm({ title: `Remove ${n} as a crafter?`, body: `Its crafter settings (switch, town, parties, stock, limits) are deleted. ${n} itself is not touched; if it is a Dwarf crafter that logs in again it shows up here as "Make this my crafter".`, confirmText: 'Remove', cancelText: 'Cancel', danger: true }))) return;
      b.disabled = true;
      const d = await api('/api/crafter', { method: 'POST', body: JSON.stringify({ name: n, remove: true, rev: CP.info ? CP.info.rev : undefined }) });
      if (!d || d.error) { b.disabled = false; if (typeof uiError === 'function') await uiError(`Not removed: ${(d && d.error) || 'no answer'}`); return; }
      delete CP.edits[n]; CP.open.delete(n); await load(true); if (box) renderBox(box); msg(`${n} removed as a crafter.`); return;
    }
    if (a === 'save') { const v = CP.edits[n]; if (!v) return; b.disabled = true; if (await save(n, v)) { delete CP.edits[n]; await load(true); if (box) renderBox(box); msg(`Saved — ${n} reads it within 10 seconds.`); } else b.disabled = false; return; }
    if (a === 'craft') { if (await cmd(`!craft ${n}`, n)) msg(`${n}: crafting one round now (it must stand in its town). The result shows here and in party chat.`); return; }
    if (a === 'book') { if (await cmd(`!craft book ${n}`, n)) msg(`${n} reads its recipe book — refresh in a few seconds.`); return; }
    if (a === 'one') {
      const I = CP.info, opts = I.recipes.map(r => ({ label: `${r.name} — ${fmt(r.count)} per craft, ${r.mp} MP`, value: r.key }));
      if (typeof uiForm !== 'function') return;
      const r = await uiForm({ title: `${n}: craft one batch`, body: 'Exactly one craft — the first live test. It needs the recipe in its recipe book, the Create Item level, the MP and the crystals / ore, and it must stand in its town.',
        fields: [{ id: 'key', label: 'Which shot', options: opts, value: 'soulshot:D' }], buttons: [{ label: 'Craft one', value: 'ok', primary: true }] });
      if (!r || r.value !== 'ok') return;
      const key = (r.values && r.values.key) || 'soulshot:D';
      if (await cmd(`!craft one ${key} ${n}`, n)) msg(`${n}: one craft of ${key} sent.`);
      return;
    }
  }

  // ---------------------------------------------------------------------- CRAFTER ITEMS (CRAFTITEMS-2026-10-15, owner: "he should also have the
  // option to disenchant items into crystals ... hand him items he can then disenchant ... send recipes and materials to him")
  // Three folding parts under each crafter card: Turn items into crystals · Recipes in its bag · Give items to the crafter (+ clan warehouse +
  // the hand-in list). Nothing happens without a tick + a confirmation (crystallize = red danger dialog).
  const CI = { cry: {}, tick: {}, give: {}, cwh: {}, open: new Set(), busy: false, grade: {} };
  const GRADES = ['D', 'C', 'B', 'A', 'S'];
  const KIND_LABEL = { recipe: 'recipe', material: 'material', gear: 'gear (can be crystallized)', other: '' };
  const HSTATE = { pending: 'Waiting for the same town', waiting: 'Waiting', starting: 'Starting', travel: 'On the way', trading: 'Trading', done: 'Done', failed: 'Failed', stopped: 'Stopped', expecting: 'Expecting' };
  const setOf = (m, k) => (m[k] = m[k] || new Set());
  const cryBlockUi = (j, t) => { t = t || {}; if (!j) return 'unknown piece'; if (j.hard) return j.hard; if (j.enchant > 0 && !t.enchanted) return `enchanted +${j.enchant} — tick "include enchanted items"`; if ((j.special || []).length && !t.special) return `${j.special.join(', ')} — tick "include special items"`; return ''; };
  const totText = (tot) => GRADES.filter(g => tot[g]).map(g => `${fmt(tot[g])} ${g}`).join(' + ') || 'no';
  const secOpen = (n, s) => CI.open.has(n + ':' + s) ? ' open' : '';
  // CRFGRADE-2026-10-23 (public tester 1.8.17: "storage crafting part filters (by grade)"): one grade filter per crafter for all its item lists
  // (crystallize, recipes, give from a bag, clan warehouse). Grade = the row's own grade, else the client item data (GD.items [name, icon, type,
  // grade index]), a recipe by the item it makes ("Recipe: X (60%)" -> X).
  const GIDX = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
  let G_BYNAME = null;
  function gradeOf(r) {
    if (!r) return '';
    if (r.grade) return String(r.grade).toUpperCase() === 'NONE' ? 'NONE' : String(r.grade).toUpperCase();
    const db = (typeof GD !== 'undefined' && GD && GD.items) || {};
    const byId = (id) => { const e = db[id]; return e && e[3] !== '' && e[3] != null && GIDX[Number(e[3])] ? GIDX[Number(e[3])] : ''; };
    const id = Number(r.id || r.itemId || 0); let g = id ? byId(id) : '';
    const nm = String(r.name || '');
    if ((!g || g === 'NONE') && /^recipe:/i.test(nm)) {
      if (!G_BYNAME) { G_BYNAME = {}; Object.keys(db).forEach(k => { const e = db[k]; if (e && e[0] && e[3] !== '' && e[3] != null && !(e[0] in G_BYNAME)) G_BYNAME[e[0]] = GIDX[Number(e[3])] || ''; }); }
      const prod = nm.replace(/^recipe:\s*/i, '').replace(/\s*\(\d+%\)\s*$/, '').trim(); g = G_BYNAME[prod] || g;
    }
    return g;
  }
  const gradeShow = (n, r) => { const f = CI.grade[n] || ''; return !f || gradeOf(r) === f; };
  function gradeBar(n, lists) {
    const have = new Set(); lists.forEach(L => (L || []).forEach(r => { const g = gradeOf(r); if (g) have.add(g); }));
    if (!have.size) return '';
    const f = CI.grade[n] || '';
    return `<div class="crf-grades" role="group" aria-label="grade filter"><span class="muted">Grade:</span> <button type="button" class="uk-btn ghost${!f ? ' on' : ''}" data-crfact="grade" data-g="" data-name="${h(n)}" aria-pressed="${!f}">All</button>${GIDX.filter(g => have.has(g)).map(g => `<button type="button" class="uk-btn ghost${f === g ? ' on' : ''}" data-crfact="grade" data-g="${g}" data-name="${h(n)}" aria-pressed="${f === g}">${g === 'NONE' ? 'No grade' : g}</button>`).join('')}</div>`;
  }
  function crySection(c) {
    const b = c.bag, n = c.name, t = CI.tick[n] || {}, sel = setOf(CI.cry, n);
    if (!b) return `<details class="crf-more" data-crfsec="${h(n)}:cry"${secOpen(n, 'cry')}><summary>Turn items into crystals (crystallize)</summary><div class="muted">${h(n)} has not reported its bag yet — this needs the new swarm.js (deploy) and the Crystallize skill (Dwarf, level 20+).</div></details>`;
    const rows = (b.cryst || []).slice().sort((x, y) => (cryBlockUi(x, t) ? 1 : 0) - (cryBlockUi(y, t) ? 1 : 0) || GRADES.indexOf(x.grade) - GRADES.indexOf(y.grade) || String(x.name).localeCompare(String(y.name)));
    [...sel].forEach(id => { const j = rows.find(r => r.objId === id); if (!j || cryBlockUi(j, t)) sel.delete(id); });
    const free = rows.filter(r => !cryBlockUi(r, t)), tot = {}; rows.filter(r => sel.has(r.objId)).forEach(r => { tot[r.grade] = (tot[r.grade] || 0) + r.crystals; });
    const lvl = b.skill || 0, maxG = lvl ? GRADES[Math.min(lvl, 5) - 1] : '';
    const list = rows.length ? rows.filter(r => gradeShow(n, r)).map(r => { const w = cryBlockUi(r, t); return `<label class="crf-item${w ? ' off' : ''}"><input type="checkbox" data-crysel="${r.objId}" data-name="${h(n)}"${sel.has(r.objId) ? ' checked' : ''}${w ? ' disabled' : ''}>
      <span class="crf-in">${h(r.name)}${r.enchant ? ` <b>+${h(r.enchant)}</b>` : ''}</span><span class="crf-ig">${h(r.grade)} · ${fmt(r.crystals)} crystals</span>${w ? `<span class="crf-iw">${h(w)}</span>` : ''}</label>`; }).join('')
      : '<div class="muted">No crystallizable gear in its bag. Give it some below ("Give items to the crafter").</div>';
    return `<details class="crf-more" data-crfsec="${h(n)}:cry"${secOpen(n, 'cry')}><summary>Turn items into crystals (crystallize) — ${free.length} of ${rows.length} can go</summary>
      <div class="muted">${lvl ? `Crystallize level ${h(lvl)}: up to ${h(maxG)}-grade.` : 'No Crystallize skill (a Dwarf learns it at level 20).'} Only items in ${h(n)}'s own bag; worn items never. Nothing happens until you tick items and confirm. Report ${ago(b.ageSec)}.</div>
      <label class="crf-sw"><input type="checkbox" data-crytick="enchanted" data-name="${h(n)}"${t.enchanted ? ' checked' : ''}> <span>Include enchanted items (+1 and more give extra crystals)</span></label>
      <label class="crf-sw"><input type="checkbox" data-crytick="special" data-name="${h(n)}"${t.special ? ' checked' : ''}> <span>Include special items (special ability / augmented / untradeable / quest)</span></label>
      <div class="crf-list">${list}</div>
      <div class="crf-acts"><button type="button" class="uk-btn ghost" data-crfact="cryall" data-name="${h(n)}"${free.length ? '' : ' disabled'}>Tick all that can go (${free.length})</button>
        <button type="button" class="uk-btn ghost" data-crfact="crynone" data-name="${h(n)}"${sel.size ? '' : ' disabled'}>Untick all</button>
        <button type="button" class="uk-btn crf-danger" data-crfact="cry" data-name="${h(n)}"${sel.size ? '' : ' disabled'}>Crystallize ${sel.size} item${sel.size === 1 ? '' : 's'}… (${h(totText(tot))} crystals)</button></div>
    </details>`;
  }
  function rcpSection(c) {
    const b = c.bag, n = c.name; if (!b) return '';
    const rs = b.recipes || [];
    const bk = b.book ? `Its dwarven recipe book holds ${fmt(b.book.dwarven)} recipes.` : 'Its recipe book was not read yet (press "Read recipe book").';
    return `<details class="crf-more" data-crfsec="${h(n)}:rcp"${secOpen(n, 'rcp')}><summary>Recipes in its bag (${rs.length})</summary>
      <div class="muted">${bk} A recipe book holds 50 recipes on a standard server (dwarven and common each). Learning uses the recipe up. Create Item level ${h(b.createLvl || 0)}${b.commonLvl ? `, Create Common Item level ${h(b.commonLvl)}` : ''}.</div>
      ${rs.length ? `<div class="crf-list">${rs.filter(r => gradeShow(n, r)).map(r => `<div class="crf-item${r.ok ? '' : ' off'}"><span class="crf-in">${h(r.name)}${r.count > 1 ? ' ×' + fmt(r.count) : ''}</span>
        <span class="crf-ig">${r.type === 'c' ? 'common' : 'dwarven'} · level ${h(r.lvl)}</span><span class="crf-iw">${h(r.why)}</span>
        <button type="button" class="uk-btn ghost" data-crfact="learn" data-name="${h(n)}" data-scroll="${h(r.scroll)}" data-rname="${h(r.name)}"${r.ok ? '' : ' disabled'}>Learn</button></div>`).join('')}</div>`
        : '<div class="muted">No recipes in its bag. Send some below.</div>'}
    </details>`;
  }
  function giveSection(c, I) {
    const n = c.name, G = CI.give[n] = CI.give[n] || { giver: '', bag: null, sel: new Set(), goNow: false, loading: false };
    const town = (c.bag && c.bag.town) || (c.status && c.status.town) || '';
    const ppl = (I.people || []).filter(p => p.name !== n).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
    const inTown = town ? ppl.filter(p => p.online && p.town === town) : [];
    let bagHtml = '';
    if (G.loading) bagHtml = '<div class="muted">Loading its bag…</div>';
    else if (G.bag) {
      const rows = (G.bag.rows || []).filter(r => r.ok && r.kind !== 'other');
      const cnt = (k) => rows.filter(r => r.kind === k).length;
      bagHtml = G.bag.ok === false ? `<div class="muted">${h(G.bag.err || 'no bag known')}</div>` : `<div class="crf-acts">${['recipe', 'material', 'gear'].map(k => `<button type="button" class="uk-btn ghost" data-crfact="givetick" data-kind="${k}" data-name="${h(n)}"${cnt(k) ? '' : ' disabled'}>Tick all ${k === 'gear' ? 'crystallizable gear' : k + 's'} (${cnt(k)})</button>`).join('')}</div>
        ${rows.length ? `<div class="crf-list">${rows.filter(r => gradeShow(n, r)).map(r => `<label class="crf-item"><input type="checkbox" data-givesel="${r.objId}" data-name="${h(n)}"${G.sel.has(r.objId) ? ' checked' : ''}><span class="crf-in">${h(r.name)}${r.enchant ? ' +' + h(r.enchant) : ''}${r.count > 1 ? ' ×' + fmt(r.count) : ''}</span><span class="crf-ig">${h(KIND_LABEL[r.kind] || '')}</span></label>`).join('')}</div>` : `<div class="muted">${h(G.giver)} has no recipes, materials or crystallizable gear to give.</div>`}
        <div class="muted">Bag ${G.bag.src === 'live' ? 'read live' : G.bag.src === 'report' ? `from its own report (${ago(G.bag.ageSec)})` : ''}. Worn, quest and untradeable items are not offered.</div>`;
    }
    const cw = I.cwh, cs = setOf(CI.cwh, n), CL = I.clanLeader || '';
    const cwhHtml = !cw ? '<div class="muted">The clan warehouse list is not known yet (the clan leader looks inside on the Clan tab / Storage page).</div>'
      : `<div class="muted">${CL === n ? `${h(n)} is the clan leader: he takes them out himself.` : `Only the clan leader${CL ? ' ' + h(CL) : ''} can take items out: he takes them out and trades them to ${h(n)}.`} List seen ${h(String(cw.seenAt || '').slice(0, 16).replace('T', ' ') || '?')}.</div>
        ${cw.items.length ? `<div class="crf-list">${cw.items.filter(r => gradeShow(n, r)).map(r => `<label class="crf-item"><input type="checkbox" data-cwhsel="${h(r.id)}" data-name="${h(n)}"${cs.has(Number(r.id)) ? ' checked' : ''}><span class="crf-in">${h(r.name)}${r.enchant ? ' +' + h(r.enchant) : ''} ×${fmt(r.count)}</span><span class="crf-ig">${h(KIND_LABEL[r.kind] || r.kind)}</span></label>`).join('')}</div>` : '<div class="muted">No recipes, materials or gear in the clan warehouse.</div>'}
        <div class="crf-acts"><button type="button" class="uk-btn secondary" data-crfact="cwh" data-name="${h(n)}"${cs.size ? '' : ' disabled'}>Bring ${cs.size} kind${cs.size === 1 ? '' : 's'} from the clan warehouse…</button></div>`;
    const hl = (c.handins || []).map(o => `<li><b>${h(String(o.at || '').slice(5, 16).replace('T', ' '))}</b> ${h(o.what || 'items')}${o.sameTown && !o.goNow ? ' (same town)' : ''}: ${o.givers.map(g => `${h(g.name)} — <i>${h(HSTATE[g.state] || g.state)}</i>${g.msg ? ': ' + h(g.msg) : ''}`).join('; ')}
      ${o.over ? '' : `<span class="crf-acts"><button type="button" class="uk-btn ghost" data-crfact="hgo" data-id="${h(o.id)}" data-name="${h(n)}"${o.givers.some(g => g.state === 'pending') ? '' : ' disabled'}>Go now</button><button type="button" class="uk-btn ghost" data-crfact="hstop" data-id="${h(o.id)}" data-name="${h(n)}">Stop</button></span>`}</li>`).join('');
    return `<details class="crf-more" data-crfsec="${h(n)}:give"${secOpen(n, 'give')}><summary>Give items to the crafter (recipes, materials, gear to crystallize)</summary>
      <div class="crf-f"><b>From everyone online${town ? ' in ' + h(town) : ''}</b><span class="muted">${town ? `${inTown.length} character${inTown.length === 1 ? '' : 's'} there now: ${h(inTown.map(p => p.name).join(', ') || 'nobody')}` : `${h(n)} is not in a town right now.`}</span>
        <div class="crf-acts"><button type="button" class="uk-btn secondary" data-crfact="town" data-kind="recipes" data-name="${h(n)}"${inTown.length ? '' : ' disabled'}>Send all recipes…</button>
        <button type="button" class="uk-btn secondary" data-crfact="town" data-kind="materials" data-name="${h(n)}"${inTown.length ? '' : ' disabled'}>Send all materials…</button></div></div>
      <div class="crf-f"><b>From one character</b>
        <div class="crf-acts"><select data-giver="${h(n)}"><option value="">Choose a character…</option>${ppl.map(p => `<option value="${h(p.name)}"${p.name === G.giver ? ' selected' : ''}>${h(p.name)}${p.town ? ' · ' + h(p.town) : ''}${p.online ? '' : ' (offline)'}</option>`).join('')}</select>
        <button type="button" class="uk-btn ghost" data-crfact="giveload" data-name="${h(n)}"${G.giver ? '' : ' disabled'}>Show its bag</button>
        <button type="button" class="uk-btn ghost" data-crfact="givekind" data-kind="recipes" data-name="${h(n)}"${G.giver ? '' : ' disabled'}>All its recipes…</button>
        <button type="button" class="uk-btn ghost" data-crfact="givekind" data-kind="materials" data-name="${h(n)}"${G.giver ? '' : ' disabled'}>All its materials…</button></div>
        ${bagHtml}</div>
      <label class="crf-sw"><input type="checkbox" data-givenow="${h(n)}"${G.goNow ? ' checked' : ''}> <span>${G.goNow ? `Go now: the giver travels to ${h(n)} at once (.townname / walk)` : `Go to the crafter now — off: a giver in another town hands it over the next time it is in ${h(town || n + "'s town")} (nobody travels for it)`}</span></label>
      ${G.bag ? `<div class="crf-acts"><button type="button" class="uk-btn secondary" data-crfact="givesend" data-name="${h(n)}"${G.sel.size ? '' : ' disabled'}>Hand ${G.sel.size} ticked item${G.sel.size === 1 ? '' : 's'} to ${h(n)}…</button></div>` : ''}
      <div class="crf-f"><b>From the clan warehouse</b>${cwhHtml}</div>
      ${hl ? `<div class="crf-f"><b>Hand-ins</b><ul class="crf-last">${hl}</ul></div>` : ''}
    </details>`;
  }
  function itemsHtml(c, I) {
    if (!c.cfg.exists && !c.bag) return '';
    const G = CI.give[c.name], bag = c.bag || {};
    const bar = gradeBar(c.name, [bag.cryst, bag.recipes, G && G.bag && G.bag.rows, I.cwh && I.cwh.items]);   // CRFGRADE
    return `<div class="crf-items"><div class="crf-sub">Items</div>${bar}${crySection(c)}${rcpSection(c)}${giveSection(c, I)}</div>`;
  }
  const crafterOf = (n) => ((CP.info || {}).crafters || []).find(x => x.name === n);
  const reBox = () => { const box = document.getElementById('stgCraft'); if (box) renderBox(box); };
  async function post(url, body) { try { return await api(url, { method: 'POST', body: JSON.stringify(body) }); } catch (e) { return { error: e.message }; } }
  async function itemsInput(ev) {
    const t = ev.target, d = t && t.dataset; if (!d) return false;
    if (d.crysel) { const s = setOf(CI.cry, d.name), id = Number(d.crysel); if (t.checked) s.add(id); else s.delete(id); reBox(); return true; }
    if (d.crytick) { const k = CI.tick[d.name] = CI.tick[d.name] || {}; k[d.crytick] = !!t.checked; reBox(); return true; }
    if (d.givesel) { const G = CI.give[d.name]; if (G) { const id = Number(d.givesel); if (t.checked) G.sel.add(id); else G.sel.delete(id); } reBox(); return true; }
    if (d.giver !== undefined && t.tagName === 'SELECT') { const G = CI.give[d.giver] = CI.give[d.giver] || { sel: new Set() }; G.giver = t.value; G.bag = null; G.sel = new Set(); reBox(); return true; }
    if (d.givenow) { const G = CI.give[d.givenow]; if (G) G.goNow = !!t.checked; reBox(); return true; }
    if (d.cwhsel) { const s = setOf(CI.cwh, d.name), id = Number(d.cwhsel); if (t.checked) s.add(id); else s.delete(id); reBox(); return true; }
    return false;
  }
  function planBody(p) {
    const g = (p.preview && p.preview.givers) || [];
    const lines = g.map(x => `${x.name}: ${x.kinds} kind${x.kinds === 1 ? '' : 's'} (${x.rows.slice(0, 6).map(r => r.name + (r.count > 1 ? ' ×' + fmt(r.count) : '')).join(', ')}${x.rows.length > 6 ? ', +' + (x.rows.length - 6) + ' more' : ''})`);
    const where = p.crafterTown || "the crafter's town";
    const probs = (p.preview.problems || []).concat(...g.map(x => (x.problems || []).map(q => `${x.name}: ${q}`)));
    return [uiP(`To `, uiEm(p.crafter), p.crafterTown ? ` (in ${p.crafterTown})` : ''), uiList(lines),
      p.goNow ? uiNote('Go now: each giver stops what it is doing for this (a raid / Kamaloka / mission must end first), travels to the crafter and trades.')
        : uiNote(`A giver already in ${where} walks over and trades now. A giver somewhere else keeps the items and hands them over the next time it stands idle in ${where} — nobody travels for it. "Go now" on the hand-in list changes that.`),
      probs.length ? uiWarn('Left out: ' + probs.slice(0, 6).join('; ') + (probs.length > 6 ? ` (+${probs.length - 6} more)` : '')) : ''].filter(Boolean);
  }
  async function handin(n, body, title) {
    const G = CI.give[n] || {}, req = Object.assign({ crafter: n, goNow: !!G.goNow }, body);
    const p = await post('/api/crafter/handin', Object.assign({ dryRun: true }, req));
    if (!p || p.error) { await uiError(`Nothing sent: ${(p && p.error) || 'no answer'}`); return; }
    if (!p.preview.givers.length) { await uiError('Nothing to hand in' + ((p.preview.problems || []).length ? ': ' + p.preview.problems.slice(0, 4).join('; ') : '.')); return; }
    if (!(await uiConfirm({ title, body: planBody(p), confirmText: 'Hand them in', cancelText: 'Cancel' }))) return;
    const r = await post('/api/crafter/handin', Object.assign({ confirm: true }, req));
    if (!r || r.error) { await uiError(`Not sent: ${(r && r.error) || 'no answer'}`); return; }
    if (G.sel) G.sel = new Set();
    msg(`Hand-in sent (${Object.keys(r.order.givers).length} giver${Object.keys(r.order.givers).length === 1 ? '' : 's'}). Follow it under "Hand-ins".`);
    await load(true); reBox();
  }
  async function itemsClick(b) {
    const a = b.dataset.crfact, n = b.dataset.name, c = crafterOf(n);
    if (a === 'cryall' || a === 'crynone') { const s = setOf(CI.cry, n); s.clear(); if (a === 'cryall' && c && c.bag) (c.bag.cryst || []).forEach(j => { if (!cryBlockUi(j, CI.tick[n])) s.add(j.objId); }); reBox(); return true; }
    if (a === 'cry') {
      if (!c || !c.bag) return true;
      const t = CI.tick[n] || {}, rows = (c.bag.cryst || []).filter(j => setOf(CI.cry, n).has(j.objId) && !cryBlockUi(j, t)); if (!rows.length) return true;
      const tot = {}; rows.forEach(j => { tot[j.grade] = (tot[j.grade] || 0) + j.crystals; });
      const risky = rows.filter(j => j.enchant > 0 || (j.special || []).length);
      const ok = await uiConfirm({ title: `Crystallize ${rows.length} item${rows.length === 1 ? '' : 's'}?`, danger: true, typeToConfirm: risky.length ? 'YES' : '',
        body: [uiWarn('This destroys the items. They turn into crystals and cannot be brought back.'),
          uiP(uiEm(n), ' crystallizes exactly these from its own bag:'),
          uiList(rows.map(j => `${j.name}${j.enchant ? ' +' + j.enchant : ''} — ${j.grade} · ${fmt(j.crystals)} crystals${(j.special || []).length ? ' (' + j.special.join(', ') + ')' : ''}`)),
          uiKV(GRADES.filter(g => tot[g]).map(g => [`${g}-grade crystals`, fmt(tot[g])])),
          risky.length ? uiWarn(`${risky.length} of them are enchanted or special. Type YES to go on.`) : ''].filter(Boolean),
        confirmText: 'Crystallize them', cancelText: 'Cancel' });
      if (!ok) return true;
      const r = await post('/api/crafter/crystallize', { name: n, objIds: rows.map(j => j.objId), enchanted: !!t.enchanted, special: !!t.special, confirm: true });
      if (!r || r.error) { await uiError(`Not sent: ${(r && r.error) || 'no answer'}`); return true; }
      setOf(CI.cry, n).clear(); msg(`${n} crystallizes ${rows.length} item${rows.length === 1 ? '' : 's'} now — report in party chat, Logs/crystallize.log and here in a minute.`); reBox(); return true;
    }
    if (a === 'learn') {
      const sc = b.dataset.scroll, rn = b.dataset.rname || 'this recipe';
      if (!(await uiConfirm({ title: `Learn ${rn}?`, body: [uiP(uiEm(n), ' uses ', uiEm(rn), ' from its bag. The recipe goes into its recipe book; the scroll is used up.'), uiNote('A full recipe book (50 on a standard server) refuses it — the server says so in party chat.')], confirmText: 'Learn it', cancelText: 'Cancel' }))) return true;
      if (await cmd(`!craft learn ${sc} ${n}`, n)) msg(`${n}: learning ${rn} — the result shows here and in party chat.`);
      return true;
    }
    if (a === 'giveload') { const G = CI.give[n]; if (!G || !G.giver) return true; G.loading = true; G.bag = null; reBox(); let d = null; try { d = await api('/api/crafter/bag?name=' + encodeURIComponent(G.giver)); } catch (e) { d = { error: e.message }; } G.loading = false; G.bag = d && d.bag ? d.bag : { ok: false, err: (d && d.error) || 'no answer', rows: [] }; G.sel = new Set(); reBox(); return true; }
    if (a === 'givetick') { const G = CI.give[n]; if (G && G.bag) (G.bag.rows || []).forEach(r => { if (r.ok && r.kind === b.dataset.kind) G.sel.add(r.objId); }); reBox(); return true; }
    if (a === 'givesend') { const G = CI.give[n]; if (!G || !G.giver || !G.sel.size) return true; await handin(n, { pick: { [G.giver]: [...G.sel] } }, `Hand ${G.sel.size} item${G.sel.size === 1 ? '' : 's'} from ${G.giver} to ${n}?`); return true; }
    if (a === 'givekind') { const G = CI.give[n]; if (!G || !G.giver) return true; await handin(n, { from: G.giver, kind: b.dataset.kind }, `Send all ${b.dataset.kind} from ${G.giver} to ${n}?`); return true; }
    if (a === 'town') { await handin(n, { from: '@town', kind: b.dataset.kind }, `Send all ${b.dataset.kind} from everyone in town to ${n}?`); return true; }
    if (a === 'cwh') {
      const I = CP.info || {}, cw = I.cwh, s = setOf(CI.cwh, n); if (!cw || !s.size) return true;
      const rows = cw.items.filter(r => s.has(Number(r.id))), CL = I.clanLeader || 'the clan leader';
      if (!(await uiConfirm({ title: `Bring ${rows.length} kind${rows.length === 1 ? '' : 's'} from the clan warehouse?`, body: [uiList(rows.map(r => `${r.name}${r.enchant ? ' +' + r.enchant : ''} ×${fmt(r.count)}`)),
        CL === n ? uiNote(`${n} is the clan leader: he walks to the warehouse keeper and takes them out himself.`) : uiNote(`${CL} walks to the warehouse keeper, takes them out (the whole stack of each) and brings them to ${n} with a trade. He stops what he is doing for this; a raid / Kamaloka / mission must end first.`)],
        confirmText: 'Bring them', cancelText: 'Cancel' }))) return true;
      const r = await post('/api/crafter/cwh', { crafter: n, items: rows.map(x => ({ id: x.id, count: 'all' })), confirm: true });
      if (!r || r.error) { await uiError(`Not sent: ${(r && r.error) || 'no answer'}`); return true; }
      s.clear(); msg(`${r.clanLeader}: taking ${rows.length} kind${rows.length === 1 ? '' : 's'} out of the clan warehouse for ${n}.`); reBox(); return true;
    }
    if (a === 'hgo') {
      if (!(await uiConfirm({ title: 'Go now?', body: 'The givers that still wait stop what they are doing, travel to the crafter (.townname / walk) and trade now.', confirmText: 'Go now', cancelText: 'Cancel' }))) return true;
      const r = await post('/api/crafter/handin/go', { id: b.dataset.id }); if (!r || r.error) { await uiError(`Not sent: ${(r && r.error) || 'no answer'}`); return true; }
      msg(`${r.givers.join(', ')}: going to ${n} now.`); await load(true); reBox(); return true;
    }
    if (a === 'hstop') {
      if (!(await uiConfirm({ title: 'Stop this hand-in?', body: 'The givers stop after the current trade window; what they still hold stays in their bags.', confirmText: 'Stop it', cancelText: 'Keep it' }))) return true;
      const r = await post('/api/trade/stop', { id: b.dataset.id }); if (!r || r.error) { await uiError(`Not sent: ${(r && r.error) || 'no answer'}`); return true; }
      msg('Stop sent.'); await load(true); reBox(); return true;
    }
    return false;
  }
  document.addEventListener('toggle', (e) => { const d = e.target && e.target.dataset && e.target.dataset.crfsec; if (!d) return; if (e.target.open) CI.open.add(d); else CI.open.delete(d); }, true);

  // ---------------------------------------------------------------------- party settings line
  function renderParty(el) {
    const L = el.dataset.crafterParty, I = CP.info; if (!I) { el.innerHTML = ''; return; }
    const p = (I.parties || []).find(x => x.leader === L), cur = p && p.crafter;
    const on = (I.crafters || []).filter(c => c.cfg.on && c.name !== L);
    if (!on.length) { el.innerHTML = `<div class="crf-pline muted">🔨 Our crafter: none switched on. A Dwarf crafter can make shots for this party — set it up on the <a href="#/storage">Storage page</a> (Our crafter).</div>`; return; }
    const c = on.find(x => x.name === cur) || on[0], st = c.status || {};
    const has = (c.cfg.parties.includes('*') || c.cfg.parties.includes(L));
    el.innerHTML = `<div class="crf-pline"><label class="crf-sw"><input type="checkbox" data-crfparty="${h(L)}" data-crfname="${h(c.name)}"${has ? ' checked' : ''}${c.cfg.parties.includes('*') ? ' disabled' : ''}>
      <span>${has ? `On — in supply runs party ${h(L)} takes shots from our crafter <b>${h(c.name)}</b> first (when it is in the same town), then buys the rest` : `Take shots from our crafter <b>${h(c.name)}</b> first — off`}</span></label>
      <div class="muted">${h(c.name)}: ${h(STATE[st.state] || 'no report yet')}${st.why ? ' — ' + h(st.why) : ''}${c.cfg.parties.includes('*') ? ' · it supplies every party' : ''} · this switch saves at once · <a href="#/storage">Crafter settings</a></div></div>`;
  }
  async function onParty(ev) {
    const t = ev.target; if (!t || !t.dataset || !t.dataset.crfparty) return;
    const L = t.dataset.crfparty, n = t.dataset.crfname, c = ((CP.info || {}).crafters || []).find(x => x.name === n); if (!c) return;
    const set = c.cfg.parties.filter(x => x !== L); if (t.checked) set.push(L);
    t.disabled = true;
    if (await save(n, { parties: set })) await load(true);
    document.querySelectorAll('[data-crafter-party]').forEach(renderParty);
  }

  // ---------------------------------------------------------------------- wiring: fill the slots when they appear
  async function tick() {
    const box = document.getElementById('stgCraft'), slots = document.querySelectorAll('[data-crafter-party]');
    const boxVis = box && box.offsetParent !== null;
    if (!boxVis && !slots.length) return;
    const stale = !CP.info || Date.now() - CP.at > 30000;
    const needParty = [...slots].some(s => !s.dataset.crfDone);
    if (!stale && !needParty && !(boxVis && !box.dataset.crfDone)) return;
    await load(stale);
    if (boxVis && !typing(box) && !Object.keys(CP.edits).length) { renderBox(box); box.dataset.crfDone = '1'; }
    else if (boxVis && !box.dataset.crfDone) { renderBox(box); box.dataset.crfDone = '1'; }
    slots.forEach(s => { if (!s.dataset.crfDone || stale) { renderParty(s); s.dataset.crfDone = '1'; } });
  }
  document.addEventListener('input', (e) => { if (e.target && e.target.dataset && e.target.dataset.crf) onInput(e); });
  document.addEventListener('change', (e) => { if (e.target && e.target.dataset && e.target.dataset.crf) onInput(e); else onParty(e); });
  document.addEventListener('click', onClick);
  document.addEventListener('change', (e) => { itemsInput(e).catch(() => { }); });   // CRAFTITEMS-2026-10-15
  setInterval(() => { tick().catch(() => { }); }, 1500);
  window.CrafterPanel = { load, renderBox, renderParty, _state: CP, _items: CI };
})();
