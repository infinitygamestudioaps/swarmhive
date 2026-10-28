// SPOIL page #/spoil[/<leader>] (SPOIL-2026-10-19, owner: "I would like to select WHAT monsters to spoil based on their drops ... some monsters are
// just waste for me. Make it possible to see the drops for monsters in the area and select which to spoil").
// Shows, per party with a Bounty Hunter / Scavenger: the monsters around it now (live + datapack spawns) with their SPOIL drops (icon, amount,
// chance), one tick per monster = spoil it or not (saved at once), a search for any monster, how the spoilers spoil (festivals, MP reserve,
// tries) and how they are doing (Logs/spoil_stats_<name>.json). Edits Scripts/data/spoil_rules.json through Dashboard/spoilpage_api.js
// (read live by swarm.js SPOIL every 10 s). Uses index.html globals: esc, api, iconUrl, TAB and uidialog (uiConfirm / uiError). No browser alerts.
(function () {
  'use strict';
  const SEC = 'tab-spoilpage';
  const SP = { open: false, info: null, leader: '', scope: 'all', area: null, areaBusy: false, found: null, q: '', timer: 0, msgT: 0, filter: 'all' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const ico = (p) => (typeof iconUrl === 'function' ? iconUrl(p) : (p ? '/icons/' + p + '.png' : '/icons/icon/etc_question_mark_i00.png'));
  const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  const pct = (c) => { const n = Number(c) || 0; return n >= 10 ? n.toFixed(0) + '%' : n >= 1 ? n.toFixed(1) + '%' : n.toFixed(2) + '%'; };
  const amt = (d) => d.min === d.max ? String(d.min) : `${d.min}–${d.max}`;

  /** the same order as spoilWanted (swarm.js SPOIL-PURE): party tick > all tick > party default > default > spoil */
  function wanted(id, leader) {
    const R = obj(SP.info && SP.info.rules), k = String(id), P = obj(obj(R.parties)[leader]);
    if (leader && obj(P.monsters)[k] !== undefined) return { on: P.monsters[k], src: 'party' };
    if (obj(R.monsters)[k] !== undefined) return { on: R.monsters[k], src: 'all' };
    if (leader && P.default !== undefined) return { on: P.default, src: 'party default' };
    if (R.default !== undefined) return { on: R.default, src: 'default' };
    return { on: true, src: 'built-in' };
  }
  const scopeLeader = () => (SP.scope === 'party' ? SP.leader : '');

  // ============================================================================================ data
  async function load() {
    let d = null;
    try { d = await api('/api/spoil'); } catch (e) { flash('The dashboard server has no Spoil API yet (it needs a restart).', true); render(); return; }
    if (!d || d.error) { flash((d && d.error) || 'no answer', true); render(); return; }
    if (d.broken) flash(`spoil_rules.json does not parse (${d.broken}) — saving is blocked until it is fixed or restored from Scripts/data/history/.`, true);
    SP.info = d;
    if (!SP.leader || !d.parties.some(p => p.leader === SP.leader)) SP.leader = (d.parties[0] && d.parties[0].leader) || '';
    render();
    if (SP.leader && !SP.area) loadArea();
  }
  async function loadArea() {
    if (!SP.leader || SP.areaBusy) return;
    SP.areaBusy = true; renderArea();
    let d = null; try { d = await api('/api/spoil/area?leader=' + encodeURIComponent(SP.leader)); } catch (e) { d = { error: e.message }; }
    SP.areaBusy = false;
    SP.area = d && !d.error ? d : { error: (d && d.error) || 'no answer', monsters: [] };
    renderArea();
  }
  async function doSearch() {
    const q = SP.q.trim(); if (q.length < 2) { SP.found = null; renderSearch(); return; }
    let d = null; try { d = await api('/api/spoil/search?q=' + encodeURIComponent(q) + '&leader=' + encodeURIComponent(SP.leader || '')); } catch (e) { d = { error: e.message }; }
    SP.found = d && !d.error ? d.monsters : [];
    renderSearch();
  }
  async function save(body, what) {
    let d = null;
    try { d = await api('/api/spoil', { method: 'POST', body: JSON.stringify(Object.assign({ rev: SP.info && SP.info.rev }, body)) }); } catch (e) { d = { error: e.message }; }
    if (d && d.conflict) { delete body.rev; try { d = await api('/api/spoil', { method: 'POST', body: JSON.stringify(body) }); } catch (e) { d = { error: e.message }; } }   // a tick never needs the other's version: apply on top
    if (!d || d.error) { if (typeof uiError === 'function') uiError('Not saved', (d && d.error) || 'no answer'); else flash('Not saved: ' + ((d && d.error) || 'no answer'), true); return false; }
    try { const x = await api('/api/spoil'); if (x && !x.error) SP.info = x; } catch (e) { }
    flash(`Saved: ${what}. The spoilers use it within 10 seconds.`);
    render(true);
    return true;
  }

  // ============================================================================================ frame
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win cpl fnd spl'; s.hidden = true;
    s.innerHTML = `<div class="cpl-headrow fnd-head"><h2><img class="gi" src="${ico('icon/skill0254')}" alt=""> Spoil</h2>
        <span class="muted cpl-intro">Which monsters your Bounty Hunters spoil. Tick the ones worth it, untick the waste. Saved at once.</span></div>
      <div class="cpl-msg" id="splMsg" role="status" hidden></div>
      <div class="box"><h3>How they are doing</h3><div id="splStats"></div></div>
      <div class="box"><h3>Monsters around a party</h3><div id="splPick"></div><div id="splArea"></div></div>
      <div class="box"><h3>Find any monster</h3><div class="spl-search"><input id="splQ" type="search" placeholder="Monster name or id, e.g. Lith Commander" autocomplete="off"></div><div id="splFound"></div></div>
      <div class="box"><h3>How they spoil</h3><div id="splSet"></div></div>
      <details class="box cpl-help"><summary><h3>How it works</h3></summary><div class="cpl-helpbody">
        <p><b>Spoil until it lands.</b> The Bounty Hunter casts Spoil on its target until the server says <i>"The Spoil condition has been activated"</i> (or <i>"already spoiled"</i>), then never again on that monster. It stops trying after the "Max tries" below.</p>
        <p><b>Spoil Festival</b> when 2 or more monsters you want spoiled stand together, <b>Sweeper</b> on each spoiled corpse, <b>Sweeper Festival</b> when 2 or more spoiled corpses lie close. Sweeping comes first: a spoiled corpse disappears after about 17 seconds.</p>
        <p><b>MP.</b> The attack skills wait while the target still needs its Spoil, and below the MP reserve, so there is always MP for the next Spoil. The Elven Elder recharges a Bounty Hunter below 60 % MP.</p>
        <p><b>Lists.</b> "All parties" is the list every Bounty Hunter uses. Pick "Only this party" to give one party its own ticks; its own tick beats the all-parties one. Monsters on no list follow "Monsters not on the list".</p>
        <p>Drops and chances come from the High Five datapack; the server may differ a little. Monsters with no spoil drops cannot be ticked.</p>
        <p>This only works while the party's "Hive picks my skills" switch is on. When it is off, the character's own L2Swarm battle settings decide. While it is on, a Spoil / Sweeper row in L2Swarm's own Combat Skills is switched off in memory (it cut the Hive's casts) and comes back when the switch is off.</p>
        <p><b>The numbers.</b> <i>Resisted</i> = the monster resisted the Spoil; the hit rate is spoiled / (spoiled + resisted). <i>No answer</i> = the cast got no answer at all (the target died during the cast, the target was switched, the cast was cut short) and is not in the rate. <i>Already spoiled</i> = another Spoil (a second spoiler, or L2Swarm's own) landed first. Many "target died" = the spoiler starts too late: the party kills faster than it spoils.</p>
      </div></details>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('change', onChange);
    s.addEventListener('click', onClick);
    let qt = 0; s.querySelector('#splQ').addEventListener('input', (e) => { SP.q = e.target.value; clearTimeout(qt); qt = setTimeout(doSearch, 300); });
    return s;
  }
  function flash(t, err) {
    const m = $id('splMsg'); if (!m) return;
    m.hidden = false; m.textContent = t; m.classList.toggle('err', !!err);
    clearTimeout(SP.msgT); if (!err) SP.msgT = setTimeout(() => { m.hidden = true; }, 5000);
  }

  // ============================================================================================ render
  function render(keepArea) {
    if (!SP.open) return;
    section();
    renderStats(); renderPick(); renderSet();
    renderArea(); if (keepArea) renderSearch();
  }
  // SPOILSTAT-2026-10-27 (tester Vykaax: "405 spoiled, 232 missed, 33% hit" could not be read): the card's numbers.
  // v2 stats (swarm.js SPOILSTAT): failed = resisted (#139), rate = landed / (landed + resisted), no-answer casts listed apart with their reasons.
  // Older stats: 'missed' counted every cast without a #612 within 0.5 s, so only the plain numbers are shown, marked "old counter".
  // SPOILNUMS-BEGIN
  function spoilStatNums(s) {
    const o = s && typeof s === 'object' ? s : {}, n = (v) => Math.max(0, Number(v) || 0);
    const landed = n(o.spoiled), failed = n(o.failed), na = o.noAns && typeof o.noAns === 'object' ? o.noAns : {};
    if (!(Number(o.v) >= 2)) return { old: true, landed, failed, rate: null, noAnswer: 0, why: '', already: 0 };
    const words = { died: 'target died', switched: 'target switched', cut: 'cut short', silent: 'silent' };
    const why = Object.keys(words).filter(k => n(na[k]) > 0).sort((a, b) => n(na[b]) - n(na[a])).map(k => `${n(na[k])} ${words[k]}`).join(', ');
    return { old: false, landed, failed, rate: landed + failed ? Math.round(landed * 100 / (landed + failed)) : null, noAnswer: n(o.noAnswer), why, already: n(o.already) };
  }
  // SPOILNUMS-END
  function renderStats() {
    const el = $id('splStats'); if (!el) return;
    const L = (SP.info && SP.info.stats) || [];
    if (!L.length) { el.innerHTML = '<div class="muted">No numbers yet. They appear about 30 seconds after the new spoil code runs on a Bounty Hunter.</div>'; return; }
    el.innerHTML = `<div class="spl-stats">${L.map(s => {
      const age = s.at ? Math.round((Date.now() - Date.parse(s.at)) / 60000) : null;
      const landed = (s.spoiled || 0) + (s.festSpoiled || 0), R = spoilStatNums(s);
      const sk = Object.entries(obj(s.skipped)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
      return `<div class="spl-st"><div class="spl-st-n"><b>${h(s.name)}</b> <span class="muted">${h(s.leader && s.leader !== s.name ? 'party ' + s.leader : '')}${age !== null ? ` · ${age < 1 ? 'just now' : age + ' min ago'}` : ''}</span></div>
        <div class="spl-st-row"><span title="Monsters spoiled (Spoil + Spoil Festival)"><img src="${ico('icon/skill0254')}" alt=""> ${landed} spoiled</span>
        ${R.old ? `<span title="Older Hive version: 'missed' also counts casts that got no answer at all">${R.failed} missed (old counter)</span>`
          : `<span title="Spoil casts the monster resisted. Hit rate = landed / (landed + resisted); casts with no answer are not in it">${R.failed} resisted${R.rate !== null ? ` (${R.rate}% hit)` : ''}</span>`}
        ${R.noAnswer ? `<span class="muted" title="Spoil casts that got no answer from the server (not counted in the hit rate)">${R.noAnswer} no answer${R.why ? ` (${h(R.why)})` : ''}</span>` : ''}
        ${R.already ? `<span class="muted" title="#357 'already spoiled': another Spoil (a second spoiler, or L2Swarm's own Combat Skills) landed first">${R.already} already spoiled</span>` : ''}
        <span title="Spoil Festival casts"><img src="${ico('icon/skill0302')}" alt=""> ${s.festCasts || 0}</span>
        <span title="Sweeper + Sweeper Festival"><img src="${ico('icon/skill0042')}" alt=""> ${(s.sweeps || 0) + (s.sweepFests || 0)} sweeps</span>
        ${s.notSpoiled ? `<span class="muted" title="Sweeper on a corpse that was not spoiled">${s.notSpoiled} empty</span>` : ''}</div>
        ${sk.length ? `<div class="muted spl-st-sk">Skipped (not on the list): ${h(sk.join(', '))}</div>` : ''}</div>`;
    }).join('')}</div>`;
  }
  function renderPick() {
    const el = $id('splPick'); if (!el) return;
    const P = (SP.info && SP.info.parties) || [];
    if (!P.length) { el.innerHTML = '<div class="muted">No party with a Bounty Hunter / Scavenger is online.</div>'; return; }
    el.innerHTML = `<div class="spl-pick">${P.map(p => `<button type="button" class="${p.leader === SP.leader ? 'on' : ''}" data-party="${h(p.leader)}">${h(p.leader)}<span class="muted"> · ${h(p.spoilers.join(', '))}</span></button>`).join('')}</div>
      <div class="spl-scope"><span>Ticks apply to:</span>
        <label><input type="radio" name="splScope" value="all" ${SP.scope === 'all' ? 'checked' : ''}> All parties</label>
        <label><input type="radio" name="splScope" value="party" ${SP.scope === 'party' ? 'checked' : ''}> Only party ${h(SP.leader)}</label>
        <span class="spl-filter"><select id="splFilter"><option value="all" ${SP.filter === 'all' ? 'selected' : ''}>Every monster here</option><option value="spoil" ${SP.filter === 'spoil' ? 'selected' : ''}>Only ones with spoil drops</option><option value="live" ${SP.filter === 'live' ? 'selected' : ''}>Only ones seen right now</option></select>
        <button type="button" data-act="refresh">Refresh</button></span></div>`;
  }
  function row(m) {
    const L = scopeLeader(), w = wanted(m.id, L), eff = wanted(m.id, SP.leader);
    const own = L && w.src === 'party';
    const drops = (m.corpse || []).map(d => `<span class="spl-drop" title="${h(d.name)} — ${amt(d)} at ${pct(d.chance)}"><img src="${ico(d.icon)}" alt="" loading="lazy"><span class="spl-dn">${h(d.name)}</span><span class="spl-dc">${amt(d) !== '1' ? '×' + amt(d) + ' ' : ''}${pct(d.chance)}</span></span>`).join('');
    const here = [m.live ? `<span class="spl-tag live">here now ×${m.live}</span>` : '', m.spawns ? `<span class="spl-tag">spawns here</span>` : ''].join('');
    const tick = m.spoilable
      ? `<label class="spl-tick ${w.on ? 'on' : 'off'}"><input type="checkbox" data-mon="${m.id}" data-name="${h(m.name)}" ${w.on ? 'checked' : ''}> ${w.on ? 'Spoil' : 'Skip'}</label>
         ${own ? `<button type="button" class="spl-reset" data-reset="${m.id}" data-name="${h(m.name)}" title="Use the all-parties tick again">party's own · reset</button>` : ''}
         ${!L && SP.leader && eff.src === 'party' ? `<span class="muted spl-ov" title="Party ${h(SP.leader)} has its own tick for this monster">${h(SP.leader)}: ${eff.on ? 'spoil' : 'skip'}</span>` : ''}`
      : '<span class="muted spl-none">no spoil drops</span>';
    return `<div class="spl-row ${m.spoilable ? (w.on ? '' : 'skip') : 'none'}"><div class="spl-head"><div class="spl-name"><b>${h(m.name)}</b> <span class="muted">Lv ${h(m.level || '?')}</span> ${here}</div><div class="spl-act">${tick}</div></div>
      ${drops ? `<div class="spl-drops">${drops}</div>` : ''}</div>`;
  }
  function renderArea() {
    const el = $id('splArea'); if (!el) return;
    if (!SP.leader) { el.innerHTML = ''; return; }
    if (SP.areaBusy && !SP.area) { el.innerHTML = '<div class="muted">Looking around…</div>'; return; }
    const A = SP.area; if (!A) { el.innerHTML = ''; return; }
    if (A.error) { el.innerHTML = `<div class="muted">Could not look around: ${h(A.error)}</div>`; return; }
    let L = A.monsters || [];
    if (SP.filter === 'spoil') L = L.filter(m => m.spoilable); else if (SP.filter === 'live') L = L.filter(m => m.live);
    const n = L.filter(m => m.spoilable).length, on = L.filter(m => m.spoilable && wanted(m.id, scopeLeader()).on).length;
    el.innerHTML = !L.length ? `<div class="muted">No monsters found around ${h(A.leader)}${A.pos ? '' : ' (position unknown)'}.</div>`
      : `<div class="muted spl-sum">${n ? `${on} of ${n} spoilable monsters ticked` : 'Nothing here has spoil drops'}${SP.areaBusy ? ' · refreshing…' : ''}
          ${n ? `<span class="spl-all"><button type="button" data-allon="1">Tick all here</button><button type="button" data-allon="0">Untick all here</button></span>` : ''}</div>
         <div class="spl-list">${L.map(row).join('')}</div>`;
  }
  function renderSearch() {
    const el = $id('splFound'); if (!el) return;
    if (!SP.found) { el.innerHTML = ''; return; }
    el.innerHTML = SP.found.length ? `<div class="spl-list">${SP.found.map(row).join('')}</div>` : '<div class="muted">No monster with that name.</div>';
  }
  function renderSet() {
    const el = $id('splSet'); if (!el || !SP.info) return;
    const S = SP.info.settings || {}, R = SP.info.rules || {};
    const num = (k, lo, hi, label, help) => `<label class="spl-set"><span>${label}</span><input type="number" min="${lo}" max="${hi}" data-set="${k}" value="${h(S[k])}"><span class="muted">${help}</span></label>`;
    el.innerHTML = `<div class="spl-sets">
      <label class="spl-set"><span>Monsters not on the list</span><select data-def="1"><option value="true" ${R.default !== false ? 'selected' : ''}>Spoil them</option><option value="false" ${R.default === false ? 'selected' : ''}>Skip them</option></select><span class="muted">for monsters nobody ticked or unticked yet (all parties)</span></label>
      <label class="spl-set"><span>Spoil Festival</span><select data-set="festival"><option value="true" ${S.festival ? 'selected' : ''}>On</option><option value="false" ${!S.festival ? 'selected' : ''}>Off</option></select><span class="muted">spoil a whole group at once</span></label>
      ${num('festivalMin', 2, 9, 'Spoil Festival from', 'monsters standing together')}
      ${num('sweepFestivalMin', 2, 9, 'Sweeper Festival from', 'spoiled corpses close to the Bounty Hunter')}
      ${num('mpReserve', 0, 90, 'MP reserve %', 'below this, attack skills wait (plain hits go on) so Spoil always has MP')}
      ${num('maxTries', 1, 20, 'Max tries', 'Spoil casts on one monster before giving up')}
    </div>`;
  }

  // ============================================================================================ events
  async function onChange(e) {
    const t = e.target;
    if (t.name === 'splScope') { SP.scope = t.value; renderArea(); renderSearch(); return; }
    if (t.id === 'splFilter') { SP.filter = t.value; renderArea(); return; }
    if (t.dataset.mon) {
      const L = scopeLeader(), on = t.checked;
      t.disabled = true;
      if (!(await save({ party: L, set: { [t.dataset.mon]: on } }, `${t.dataset.name}: ${on ? 'spoil' : 'skip'}${L ? ' (party ' + L + ')' : ''}`))) { t.checked = !on; t.disabled = false; }
      return;
    }
    if (t.dataset.def) { await save({ party: '', default: t.value === 'true' }, `monsters not on the list: ${t.value === 'true' ? 'spoil' : 'skip'}`); return; }
    if (t.dataset.set) {
      const k = t.dataset.set, v = k === 'festival' ? t.value === 'true' : Number(t.value);
      if (k !== 'festival' && !(isFinite(v) && v >= Number(t.min) && v <= Number(t.max))) { flash(`${k}: a number from ${t.min} to ${t.max}`, true); renderSet(); return; }
      await save({ party: '', settings: { [k]: v } }, `${k} = ${v}`);
    }
  }
  async function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.party) { SP.leader = b.dataset.party; SP.area = null; try { location.hash = '#/spoil/' + encodeURIComponent(SP.leader); } catch (er) { } render(); loadArea(); return; }
    if (b.dataset.act === 'refresh') { loadArea(); return; }
    if (b.dataset.reset) { await save({ party: SP.leader, set: { [b.dataset.reset]: null } }, `${b.dataset.name}: party ${SP.leader} uses the all-parties tick`); return; }
    if (b.dataset.allon) {
      const on = b.dataset.allon === '1', L = scopeLeader();
      const list = ((SP.area && SP.area.monsters) || []).filter(m => m.spoilable && (SP.filter !== 'live' || m.live));
      if (!list.length) return;
      const ok = typeof uiConfirm === 'function' ? await uiConfirm({ title: `${on ? 'Tick' : 'Untick'} ${list.length} monsters?`, body: [typeof uiP === 'function' ? uiP(`${on ? 'Spoil' : 'Skip'} every spoilable monster in this list${L ? ' for party ' + L : ' for all parties'}.`) : ''], confirmText: on ? 'Tick all' : 'Untick all' }) : true;
      if (!ok) return;
      const set = {}; list.forEach(m => { set[m.id] = on; });
      await save({ party: L, set }, `${list.length} monsters: ${on ? 'spoil' : 'skip'}`);
    }
  }

  // ============================================================================================ routing
  function open(leader) {
    try { stopChar(); } catch (e) { }
    if (!SP.open) window.scrollTo(0, 0);
    SP.open = true;
    if (leader && leader !== SP.leader) { SP.leader = leader; SP.area = null; }
    const s = section(); s.hidden = false;
    clearInterval(SP.timer); SP.timer = setInterval(() => { if (!document.hidden && SP.open) api('/api/spoil').then(x => { if (x && !x.error) { SP.info = x; renderStats(); } }).catch(() => { }); }, 30000);
    load();
  }
  function route(kind, arg) {
    if (kind !== 'spoil') { close(); return false; }
    try { document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; }); } catch (e) { }
    try { TAB = 'spoil'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'spoil')); } catch (e) { }
    open(arg ? decodeURIComponent(arg) : '');
    return true;
  }
  function close() { if (!SP.open) return; SP.open = false; clearInterval(SP.timer); SP.timer = 0; const s = $id(SEC); if (s) s.hidden = true; }
  window.SpoilPage = { route, open, close, wanted, _state: SP };
})();
