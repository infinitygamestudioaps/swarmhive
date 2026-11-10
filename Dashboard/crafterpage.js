// CLAN CRAFTER PAGE #/crafter (CRAFTERPAGE-2026-11-01, owner: "a live page where I can see needs for crafting depending on what I set the individual
// numbers for ... 50000 soulshots A grade and 40000 blessed spiritshots C grade" / "the price should be normal cost ... Crafter1 will be the clan
// bank so the accounts should go up"). Per shot: the target you type, in stock (crafter bag + its warehouse + clan warehouse), short by, the ore and
// crystals the shortfall needs (have / missing), batches craftable now, "1 batch" / "Craft a round" (command queue, asks first), "Sell to a party"
// (normal cost, two same-town trade orders, asks first). The bank: balance now, income / spending, sales per party, the balance line, the ledger.
// Data: /api/crafterpage (Dashboard/crafterpage_api.js). Targets = crafter_rules.json stock (the same numbers swarm.js CRAFT crafts toward).
(function () {
  'use strict';
  const SEC = 'tab-crafter';
  const S = { open: false, d: null, edit: {}, dirty: false, timer: 0, msgT: 0 };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const icoOf = (id) => { try { const v = (typeof GD !== 'undefined' && GD.items) ? GD.items[id] : null; if (Array.isArray(v) && v[1]) return (typeof iconUrl === 'function' ? iconUrl(v[1]) : '/icons/' + v[1] + '.png'); } catch (e) { } return ''; };
  const img = (id) => { const u = icoOf(id); return u ? `<img class="cfp-ic" src="${h(u)}" alt="">` : ''; };
  const KIND = { soulshot: 'Soulshots', spiritshot: 'Spiritshots', blessed: 'Blessed Spiritshots' };
  const CSS = `#tab-crafter .cfp-top{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:4px 0 10px}
#tab-crafter .cfp-pill{padding:2px 8px;border-radius:10px;background:rgba(255,255,255,.07)}
#tab-crafter .cfp-pill.ok{color:#9fd59a}#tab-crafter .cfp-pill.bad{color:#f0a37a}
#tab-crafter h3{margin:14px 0 6px}
#tab-crafter .cfp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px}
#tab-crafter .cfp-card{border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:8px;background:rgba(0,0,0,.18);min-width:0}
#tab-crafter .cfp-card.done{border-color:rgba(120,200,120,.45)}#tab-crafter .cfp-card.short{border-color:rgba(230,160,90,.45)}
#tab-crafter .cfp-hd{display:flex;align-items:center;gap:6px;font-weight:bold}#tab-crafter .cfp-ic{width:22px;height:22px}
#tab-crafter .cfp-row{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;font-size:13px}
#tab-crafter .cfp-row label{display:flex;align-items:center;gap:6px}
#tab-crafter input[type=number]{width:120px;min-height:32px}
#tab-crafter .cfp-mat.miss{color:#f0a37a}#tab-crafter .cfp-act{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
#tab-crafter .cfp-act button{min-height:32px}
#tab-crafter .cfp-bar{position:sticky;bottom:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;margin:0 -8px;background:#18150f;border-top:1px solid rgba(255,255,255,.12)}
#tab-crafter table{width:100%;border-collapse:collapse;font-size:13px}#tab-crafter td,#tab-crafter th{padding:3px 6px;text-align:left;border-bottom:1px solid rgba(255,255,255,.07)}
#tab-crafter .cfp-scroll{overflow-x:auto;max-width:100%}#tab-crafter svg.cfp-line{width:100%;height:70px}
#tab-crafter .cfp-msg{padding:6px 8px;margin:6px 0;border-radius:4px;background:rgba(120,200,120,.15)}#tab-crafter .cfp-msg.bad{background:rgba(230,120,90,.18)}`;
  async function load() { let d = null; try { d = await api('/api/crafterpage'); } catch (e) { d = { error: e.message }; } S.d = d; render(); }
  function section() {
    let s = $id(SEC); if (s) return s;
    if (!$id('cfpCss')) { const st = document.createElement('style'); st.id = 'cfpCss'; st.textContent = CSS; document.head.appendChild(st); }
    s = document.createElement('section'); s.id = SEC; s.className = 'win'; s.hidden = true;
    s.innerHTML = `<div class="whead"><h2>Clan crafter</h2></div><div class="cfp-msg" id="cfpMsg" role="status" hidden></div><div id="cfpBody"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('input', onInput);
    return s;
  }
  function route(kind) { if (kind === 'crafter') { open(); return true; } close(); return false; }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'crafter'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'crafter')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; render(); load();
    clearInterval(S.timer); S.timer = setInterval(() => { if (S.open && !document.hidden && !S.dirty) load(); }, 20000);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.timer); const s = $id(SEC); if (s) s.hidden = true; }
  function flash(t, bad) { const m = $id('cfpMsg'); if (!m) return; m.hidden = !t; m.className = 'cfp-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; clearTimeout(S.msgT); S.msgT = setTimeout(() => { const x = $id('cfpMsg'); if (x) x.hidden = true; }, 9000); }
  function card(r) {
    const tv = S.edit[r.key] !== undefined ? S.edit[r.key] : (r.target || '');
    const mats = r.ing.map(g => { const nm = (S.d.mats.find(m => m.id === g.id) || {}).name || g.id; return `<span class="cfp-mat${g.missing ? ' miss' : ''}" title="${h(nm)}: ${g.perBatch} per batch">${h(nm)} ${fmt(g.need)} (have ${fmt(g.have)}${g.missing ? ', missing ' + fmt(g.missing) : ''})</span>`; }).join(' · ');
    return `<div class="cfp-card${r.done ? ' done' : r.short ? ' short' : ''}">
      <div class="cfp-hd">${img(r.product)}${h(r.name)}<span class="muted" style="font-weight:normal">· ${fmt(r.perBatch)} per batch · ${fmt(r.price)} a each</span></div>
      <div class="cfp-row"><span title="bag ${fmt(r.where.bag)} · warehouse ${fmt(r.where.wh)} · clan ${fmt(r.where.clan)}">in stock <b>${fmt(r.have)}</b></span>
        <label>target <input type="number" min="0" max="10000000" step="1000" inputmode="numeric" data-cftarget="${h(r.key)}" value="${h(tv)}" aria-label="target ${h(r.name)}"></label></div>
      ${r.target ? `<div class="cfp-row">${r.short ? `<span>short by <b>${fmt(r.short)}</b> = ${r.batches} batch${r.batches === 1 ? '' : 'es'}</span><span>can craft now: <b>${r.canNow}</b> batch${r.canNow === 1 ? '' : 'es'}</span>` : '<span class="cfp-pill ok">target reached</span>'}</div>
        ${r.short ? `<div class="cfp-row"><span>needs: ${mats}</span></div>` : ''}` : '<div class="cfp-row muted">no target = not crafted</div>'}
      <div class="cfp-act"><button type="button" data-cfcraft="${h(r.key)}" ${r.canNow > 0 ? '' : 'disabled'} title="${r.canNow > 0 ? 'one batch now (command queue)' : 'not enough ore / crystals'}">Craft 1 batch</button>
        <button type="button" data-cfsell="${h(r.key)}" ${r.where.bag > 0 ? '' : 'disabled'} title="${r.where.bag > 0 ? 'hand shots to a party at normal cost' : 'none in the crafter\'s bag'}">Sell to a party…</button></div></div>`;
  }
  function line(rows) {
    if (!rows || rows.length < 2) return '<div class="muted">The balance line starts after a few 10-minute samples.</div>';
    const v = rows.map(r => Number(r.adena) || 0), lo = Math.min(...v), hi = Math.max(...v), W = 300, H = 60, k = hi > lo ? H / (hi - lo) : 0;
    const pts = v.map((x, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - (x - lo) * k + 5).toFixed(1)}`).join(' ');
    return `<svg class="cfp-line" viewBox="0 0 ${W} ${H + 10}" preserveAspectRatio="none" role="img" aria-label="bank balance from ${fmt(lo)} to ${fmt(hi)}"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${pts}"/></svg><div class="muted">${fmt(v[0])} → ${fmt(v[v.length - 1])} adena (${rows.length} samples)</div>`;
  }
  function render() {
    if (!S.open) return; section();
    const d = S.d, body = $id('cfpBody');
    if (!d) { body.innerHTML = '<div class="muted">Loading…</div>'; return; }
    if (d.error) { body.innerHTML = `<div class="cfp-msg bad">${h(d.error)}</div>`; return; }
    const st = d.status, sum = d.ledger.summary;
    const groups = Object.keys(KIND).map(k => ({ k, rows: d.rows.filter(r => r.key.startsWith(k + ':')) }));
    const RK = d.roleKnown || {}, stale = (k, n) => n && RK[k] === false ? ' <span class="cfp-pill bad" title="no account / character of this install has this name">not a character of this install</span>' : '';   // PICKALL-2026-11-10
    body.innerHTML = `<div class="cfp-top"><span>Crafter <b>${h(d.crafter || 'none set')}</b>${stale('crafter', d.crafter)} <button type="button" data-cfrole="crafter">Change crafter</button></span>
        <span>Bank <b>${h(d.bank || 'none set')}</b>${stale('bank', d.bank)}${d.bank ? `: ${fmt(d.bankNow.adena)} adena${d.bankNow.online ? '' : ' (offline)'}` : ''} <button type="button" data-cfrole="bank">Change bank</button></span>
        <span class="cfp-pill ${d.cfg.on ? 'ok' : 'bad'}">${d.cfg.on ? 'crafts toward the targets by itself in ' + h(d.cfg.town) : 'automatic crafting OFF'}</span>
        ${st ? `<span class="muted">now: ${h(st.state || '')} ${h(st.why || '')}</span>` : ''}</div>
      <div class="muted">Stock = ${h(d.crafter)}'s bag + its warehouse + the clan warehouse (clan seen ${h(d.seen.clan || 'never')}). Type a target per shot, then Save.</div>
      ${groups.map(g => `<h3>${KIND[g.k]}</h3><div class="cfp-grid">${g.rows.map(card).join('')}</div>`).join('')}
      <h3>Materials for every shortfall</h3><div class="cfp-scroll"><table><tr><th>Material</th><th>Needed</th><th>Have</th><th>Missing</th></tr>
        ${d.total.filter(t => t.need > 0).map(t => `<tr><td>${img(t.id)}${h(t.name)}</td><td>${fmt(t.need)}</td><td>${fmt(t.have)}</td><td${t.missing ? ' class="cfp-mat miss"' : ''}>${fmt(t.missing)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No shortfall — nothing needed.</td></tr>'}</table></div>
      <div class="muted">Crystals come from crystallizing (Storage page marks); Soul Ore / Spirit Ore from loot and shops.</div>
      ${runnerBox(d)}
      <h3>Clan bank</h3>
      <div class="cfp-row"><span>income <b>${fmt(sum.income)}</b></span><span>spending <b>${fmt(sum.spending)}</b></span><span>net <b>${fmt(sum.net)}</b></span><span>${sum.rows} ledger rows</span></div>
      ${line(d.balance)}
      ${Object.keys(sum.salesBy).length ? `<div class="cfp-scroll"><table><tr><th>Party</th><th>Shots bought</th><th>Paid</th></tr>${Object.entries(sum.salesBy).map(([w, x]) => `<tr><td>${h(w)}</td><td>${fmt(x.count)}</td><td>${fmt(x.adena)}</td></tr>`).join('')}</table></div>` : ''}
      <div class="cfp-scroll"><table><tr><th>When</th><th>What</th><th>Who</th><th>Count</th><th>Adena</th><th>Note</th></tr>${d.ledger.last.map(r => `<tr><td>${h(String(r.at).slice(0, 16).replace('T', ' '))}</td><td>${h(r.kind)}</td><td>${h(r.who)}</td><td>${r.count ? fmt(r.count) : ''}</td><td>${fmt(r.adena)}</td><td>${h(r.note)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No rows yet.</td></tr>'}</table></div>
      <div class="cfp-bar"><button type="button" class="go" data-cfsave="1" ${S.dirty ? '' : 'disabled'}>Save targets</button><button type="button" data-cfround="1">Craft a round now</button><span class="muted">${S.dirty ? 'unsaved changes' : ''}</span></div>`;
  }
  // CRAFTRUN-2026-11-01 (owner: "the collector role now can run to parties and collect items, letters, materials and refill them with soulshots,
  // blessed spiritshots"): the runner - who it is, its switch, where it is, its queue; and the clan warehouse worker (the crafter takes out itself)
  function runnerBox(d) {
    const R = d.runner || {}, q = Array.isArray(R.queue) ? R.queue : [];
    return `<h3>Runner (supplies out, loot back)</h3>
      <div class="cfp-row"><span>Runner <b>${h(R.name || 'none set')}</b>${R.name && (d.roleKnown || {}).runner === false ? ' <span class="cfp-pill bad">not a character of this install</span>' : ''}</span>
        <span class="cfp-pill ${R.on && R.name ? 'ok' : 'bad'}">${R.on && R.name ? 'ON: parties call it instead of a supply run' : 'OFF: parties still do their own supply runs'}</span>
        ${R.name ? `<button type="button" data-cfrunon="${R.on ? '0' : '1'}">${R.on ? 'Switch the runner OFF' : 'Switch the runner ON'}</button>` : ''}
        <button type="button" data-cfrunner="1">${R.name ? 'Change runner' : 'Pick the runner'}</button></div>
      ${R.name ? `<div class="cfp-row"><span>Runner walks in everywhere (stealth): Silent Move on the whole trip, no level limit (OFF: no monster above its level + 5 - a member meets it at the landing)</span>
        <span class="cfp-pill ${R.runnerStealth !== false ? 'ok' : 'bad'}">${R.runnerStealth !== false ? 'ON' : 'OFF'}</span>
        <button type="button" data-cfstealth="${R.runnerStealth !== false ? '0' : '1'}">${R.runnerStealth !== false ? 'Stealth OFF' : 'Stealth ON'}</button></div>` : ''}
      ${R.name ? `<div class="cfp-row"><span>Rotation (no call waiting): visits the farming parties and brings their drops to the bank</span>
        <span class="cfp-pill ${R.rotateOn !== false ? 'ok' : 'bad'}">${R.rotateOn !== false ? 'ON' : 'OFF'}</span>
        <button type="button" data-cfroton="${R.rotateOn !== false ? '0' : '1'}">${R.rotateOn !== false ? 'Rotation OFF' : 'Rotation ON'}</button>
        <label>each party at most every <input type="number" id="cfRotMin" min="10" max="1440" step="5" value="${h(String(R.rotateMin || 60))}" style="width:5em"> min</label>
        <button type="button" data-cfrotmin="1">Save</button></div>` : ''}
      ${R.name && R.at ? `<div class="muted">${h(R.name)} ${R.town ? 'in ' + h(R.town) : 'in the field'} · ${h(R.state || '')}${R.cur ? ' · serving ' + h(R.cur) : ''} · seen ${h(String(R.at).slice(11, 16))}</div>` : ''}
      ${q.length ? `<div class="cfp-scroll"><table><tr><th>Party</th><th>Out of shots</th><th>Called</th></tr>${q.map(c => `<tr><td>${h(c.party)}</td><td>${c.out ? 'yes' : ''}</td><td>${h(String(c.at).slice(11, 16))}</td></tr>`).join('')}</table></div>` : '<div class="muted">No party waiting for the runner.</div>'}
      <div class="muted">Clan warehouse: ${R.cwhWithdraw !== false ? `<b>${h(d.crafter)}</b> takes the Storage page's sell / crystallize marks out himself, sells and crystallizes them` : 'the clan leader takes the marks out'}. Shots cost the NPC price, paid by the party leader to the bank${Object.keys(R.pays || {}).length ? ' (free for: ' + h(Object.keys(R.pays).join(', ')) + ')' : ''}.</div>`;
  }
  async function runnerSet(body, msg) {
    let r = null; try { r = await api('/api/crafterpage', { method: 'POST', body: JSON.stringify(Object.assign({ action: 'settings' }, body)) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { flash('Not saved: ' + ((r && r.error) || '?'), true); return; }
    flash(msg); load();
  }
  // PICKALL-2026-11-10 (public tester Vykaax: "Crafter1 is locked as the bank ... 'Change runner' ... a limited selection. I can't even select my
  // Plainswalker 'vRunner'"): ONE picker for the runner / bank / crafter, used by this page AND the Runner page (window.CrafterPage.pickRole).
  // Lists EVERY character of the install (/api/crafterpage chars: no class filter, no cap) with a filter box; one that cannot take the role is
  // greyed with the reason (crafter.md R16: the runner is never the bank / crafter). Saved to Scripts/data/crafter.json (the file the bots read).
  const ROLE = {
    runner: { title: 'Who is the runner?', note: 'Any class works (a dagger / Plainswalker with Silent Move walks in everywhere). It takes shots from the crafter to a party that calls, collects its loot / materials / letters and brings everything to the bank.', done: (n) => n ? `Runner: ${n}${S.d && S.d.runner && S.d.runner.on ? '' : ' (switch it ON to use it)'}.` : 'No runner.' },
    bank: { title: 'Who is the clan bank?', note: 'The bank holds the clan money, receives the runner\'s deliveries, sells / crystallizes / stores them and does every clan warehouse job. It never leaves Giran.', done: (n) => `Bank: ${n}.` },
    crafter: { title: 'Who is the crafter?', note: 'Crafts the shots (a Dwarven Artisan / Warsmith / Maestro with Create Item). The stock targets are kept per crafter; who crafts by itself is the Storage page\'s "Our crafter".', done: (n) => `Crafter: ${n}.` },
  };
  async function pickRole(role) {
    const R0 = ROLE[role]; if (!R0) return { error: 'unknown role ' + role };
    let d = null; try { d = await api('/api/crafterpage'); } catch (e) { d = { error: e.message }; }
    if (!d || d.error) return { error: 'could not load the characters: ' + ((d && d.error) || '?') };
    const cur = role === 'runner' ? String((d.runner && d.runner.name) || '') : String(d[role] || '');
    const chars = Array.isArray(d.chars) ? d.chars : [];
    const opt = (c) => {
      const why = (c.block || {})[role] || '';
      const bits = [c.cls, c.level != null ? 'lvl ' + c.level : '', c.party ? (c.party === c.name ? 'party leader' : 'party ' + c.party) : '', c.online ? 'online' : 'offline'].filter(Boolean).join(' · ');
      return { label: `${c.name}${c.name === cur ? ' (now)' : ''}${bits ? ' — ' + bits : ''}${why ? ' — ' + why : ''}`, value: c.name, disabled: !!why, hint: why || bits };
    };
    const options = (role === 'runner' ? [{ label: 'nobody (no runner)' + (cur ? '' : ' (now)'), value: '' }] : []).concat(chars.map(opt));
    if (cur && !chars.some(c => c.name === cur)) options.unshift({ label: `${cur} (now) — not a character of this install`, value: cur, disabled: true, hint: 'no account of this install has this name' });
    const start = options.find(o => o.value === cur && !o.disabled);
    const res = await uiForm({ title: R0.title, body: [uiNote(R0.note), uiNote(`${chars.length} characters - type to filter. Greyed = cannot take this role (the reason is in the line).`)],
      fields: [{ id: 'who', label: 'Character', column: true, search: 'Filter by name, class or party…', options, value: start ? start.value : null }], buttons: [{ label: 'Save', value: 'ok', primary: true }] });
    if (!res) return { cancelled: true };
    const who = res.values && res.values.who;
    if (who == null || (role !== 'runner' && !who)) return { error: 'nobody picked' };
    if (who === cur) return { ok: true, msg: 'No change.' };
    let r = null; try { r = await api('/api/crafterpage', { method: 'POST', body: JSON.stringify({ action: 'settings', [role]: who }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) return { error: (r && r.error) || '?' };
    return { ok: true, msg: R0.done(who), who };
  }
  async function pickRunner() { await rolePick('runner'); }
  async function rolePick(role) {
    const r = await pickRole(role); if (!r || r.cancelled) return;
    if (r.error) { flash('Not saved: ' + r.error, true); return; }
    flash(r.msg); load();
  }
  async function save() {
    const targets = {}; Object.keys(S.edit).forEach(k => { const v = String(S.edit[k]).trim(); targets[k] = v === '' ? null : Number(v); });
    let r = null; try { r = await api('/api/crafterpage', { method: 'POST', body: JSON.stringify({ action: 'targets', targets, rev: S.d && S.d.rev }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { flash('Not saved: ' + ((r && r.error) || '?'), true); return; }
    S.edit = {}; S.dirty = false; flash('Targets saved.'); load();
  }
  async function craft(key) {
    const r0 = key ? S.d.rows.find(x => x.key === key) : null;
    const ok = await uiConfirm({ title: key ? `${S.d.crafter}: craft 1 batch of ${r0.name}?` : `${S.d.crafter}: a craft round now?`, body: [uiP(key ? `${fmt(r0.perBatch)} shots from ${r0.ing.map(g => g.perBatch + '× ' + ((S.d.mats.find(m => m.id === g.id) || {}).name || g.id)).join(' + ')}.` : `Up to ${S.d.cfg.maxBatches} batches toward the targets, with the ore and crystals in its bag.`), uiNote('Sent through the command queue (one order at a time per party).')], confirmText: 'Send' });
    if (!ok) return;
    let r = null; try { r = await api('/api/crafterpage', { method: 'POST', body: JSON.stringify({ action: 'craft', key: key || undefined, confirm: true }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { flash('Not sent: ' + ((r && r.error) || '?'), true); return; }
    flash(`Queued: ${r.cmd}`);
  }
  async function sell(key) {
    const r0 = S.d.rows.find(x => x.key === key); if (!r0) return;
    const parties = (S.d.leaders || S.d.parties || []).filter(p => p !== S.d.crafter);   // PICKALL-2026-11-10: the party leaders, no 40 cap
    const party = await uiChoice({ title: `Sell ${r0.name} to which party?`, body: [uiNote(`Normal cost: ${fmt(r0.price)} adena each. Both hand over in the same town (nobody travels for it).`)], buttons: parties.map(p => ({ label: p, value: p })) });
    if (!party) return;
    const cnt = await uiChoice({ title: `How many ${r0.name} for ${party}?`, body: [uiNote(`${S.d.crafter} has ${fmt(r0.where.bag)} in the bag.`)], buttons: [1000, 5000, 10000, 20000, 50000].filter(x => x <= r0.where.bag).map(x => ({ label: `${fmt(x)} = ${fmt(x * r0.price)} adena`, value: String(x) })) });
    if (!cnt) return;
    let r = null; try { r = await api('/api/crafterpage', { method: 'POST', body: JSON.stringify({ action: 'sell', key, party, count: Number(cnt), confirm: true }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { flash('Not sent: ' + ((r && r.error) || '?'), true); return; }
    flash(`${fmt(r.sale.count)} ${r0.name} to ${party} for ${fmt(r.sale.adena)} adena — two hand-over orders sent, ledger row written.`); load();
  }
  function onClick(e) {
    const t = e.target, g = (s) => t.closest(s); let b;
    if (g('[data-cfsave]')) { save(); return; }
    if (g('[data-cfround]')) { craft(''); return; }
    if ((b = g('[data-cfcraft]'))) { craft(b.dataset.cfcraft); return; }
    if ((b = g('[data-cfsell]'))) { sell(b.dataset.cfsell); return; }
    if (g('[data-cfrunner]')) { pickRunner(); return; }
    if ((b = g('[data-cfrole]'))) { rolePick(b.dataset.cfrole); return; }   // PICKALL-2026-11-10: Change bank / Change crafter
    // RUNNERROTATE-2026-11-03: the runner's rotation through the farming parties
    if ((b = g('[data-cfstealth]'))) { const on = b.dataset.cfstealth === '1'; runnerSet({ runnerStealth: on }, on ? 'Stealth ON: the runner walks in to every party, Silent Move on the whole trip' : 'Stealth OFF: the runner keeps the level limit (a member meets it at the landing)'); return; }   // RUNNERSTEALTH-2026-11-03
    if ((b = g('[data-cfroton]'))) { const on = b.dataset.cfroton === '1'; runnerSet({ rotateOn: on }, on ? 'Rotation ON: with no call waiting the runner visits the farming parties' : 'Rotation OFF: the runner only answers calls'); return; }
    if (g('[data-cfrotmin]')) { const el = document.getElementById('cfRotMin'), m = Math.round(Number(el && el.value)); if (!(m >= 10 && m <= 1440)) { flash('10 - 1440 minutes', true); return; } runnerSet({ rotateMin: m }, `Each party is visited at most every ${m} min`); return; }
    if ((b = g('[data-cfrunon]'))) { const on = b.dataset.cfrunon === '1'; uiConfirm({ title: on ? `Switch the runner ${S.d.runner.name} ON?` : 'Switch the runner OFF?', body: [uiP(on ? 'Parties low on supplies call the runner instead of going to town; it brings their shots and takes their loot to the crafter.' : 'Parties do their own supply runs again.')], confirmText: on ? 'Switch ON' : 'Switch OFF' }).then(ok => { if (ok) runnerSet({ runnerOn: on }, on ? 'Runner ON.' : 'Runner OFF.'); }); return; }
  }
  function onInput(e) {
    const t = e.target; if (!t.dataset.cftarget) return;
    S.edit[t.dataset.cftarget] = t.value; S.dirty = true;
    const bar = document.querySelector('#tab-crafter [data-cfsave]'); if (bar) bar.disabled = false;
  }
  window.CrafterPage = { route, open, close, pickRole, _state: S };
})();
