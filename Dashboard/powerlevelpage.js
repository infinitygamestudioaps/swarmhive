// POWER LEVEL PAGE #/powerlevel (POWERLEVEL-2026-11-03, owner: "I want a way to have a healer OUT of party healing a character that is power
// leveling ... There should not be any level restrictions for a solo char with healer, it should be up to the person controlling hive to determine").
// New pair: pick the LEVELER (it hunts alone in its own party = all the exp) + the HEALER (another party; follows at keepDist, heals / resurrects
// it by direct target, never attacks), switches (AOE pull, heal at %, keep distance), the spot ("where the leveler stands now"; none = the
// leveler's own party spot / automatic, no level limits). Live per pair: both characters' HP / MP, distance, the healer's last cast, exp / h.
// Data: GET / POST /api/powerlevel (Dashboard/powerlevel_api.js) -> Scripts/data/powerlevel.json, read by swarm.js POWERLEVEL every 5 s.
(function () {
  'use strict';
  const SEC = 'tab-powerlevel';
  const S = { open: false, d: null, timer: 0, msgT: 0, err: '', lv: '', hl: '' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (v) => v == null ? '?' : Math.round(Number(v)) + ' %';
  const hm = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toTimeString().slice(0, 5); };
  const CSS = `#tab-powerlevel .plp-box{border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:8px;background:rgba(0,0,0,.18);margin-bottom:8px;min-width:0}
#tab-powerlevel .plp-row{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:13px;margin:4px 0}
#tab-powerlevel .plp-row button,#tab-powerlevel .plp-row select{min-height:34px;max-width:100%}
#tab-powerlevel .plp-pill{padding:2px 8px;border-radius:10px;background:rgba(255,255,255,.07)}
#tab-powerlevel .plp-pill.ok{color:#9fd59a}#tab-powerlevel .plp-pill.bad{color:#f0a37a}
#tab-powerlevel .plp-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:8px}
#tab-powerlevel .plp-warn{color:#f0c27a}
#tab-powerlevel .muted{opacity:.7}
#tab-powerlevel .plp-msg{margin:6px 0;padding:6px;border-radius:4px;background:rgba(120,200,120,.15)}#tab-powerlevel .plp-msg.bad{background:rgba(230,120,90,.2)}
#tab-powerlevel input[type=number]{width:80px;min-height:30px}`;
  function section() {
    let s = $id(SEC); if (s) return s;
    if (!$id('plp-css')) { const st = document.createElement('style'); st.id = 'plp-css'; st.textContent = CSS; document.head.appendChild(st); }
    s = document.createElement('section'); s.id = SEC; s.hidden = true;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('change', onChange);
    return s;
  }
  function route(kind) { if (kind === 'powerlevel') { open(); return true; } close(); return false; }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'powerlevel'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'powerlevel')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; render(); load();
    clearInterval(S.timer); S.timer = setInterval(() => { if (S.open && !document.hidden) load(); }, 5000);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.timer); const s = $id(SEC); if (s) s.hidden = true; }
  async function load() { try { const d = await api('/api/powerlevel'); if (d && !d.error) { S.d = d; S.err = ''; } else S.err = (d && d.error) || 'no answer'; } catch (e) { S.err = e.message; } if (S.open) render(); }
  function flash(t, bad) { const m = $id('plpMsg'); if (!m) return; m.hidden = !t; m.className = 'plp-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; clearTimeout(S.msgT); S.msgT = setTimeout(() => { if (m) m.hidden = true; }, 6000); }
  const optList = (list, sel, pick) => `<option value="">— pick —</option>` + list.map(c => `<option value="${h(c.name)}"${c.name === sel ? ' selected' : ''}>${h(c.name)} (lvl ${h(c.level || '?')} ${h(c.cls || '')})${pick && c.healer ? ' ✚' : ''}${c.online ? '' : ' - offline'}</option>`).join('');
  function pairCard(p) {
    const L = p.live || {}, a = L.leveler || {}, b = L.healer || {};
    return `<div class="plp-box" data-plpcard="${h(p.leveler)}">
      <div class="plp-row"><b>${h(p.leveler)}</b> levels · <b>${h(p.healer)}</b> heals
        <span class="plp-pill ${p.on ? 'ok' : 'bad'}">${p.on ? 'ON' : 'OFF'}</span>
        <button type="button" data-plpon="${h(p.leveler)}" data-v="${p.on ? '0' : '1'}">${p.on ? 'Stop' : 'Start'}</button>
        <button type="button" data-plpdel="${h(p.leveler)}">Delete</button></div>
      ${p.warn ? `<div class="plp-row plp-warn">⚠ ${h(p.warn)}</div>` : ''}
      ${b.healerClass === false ? `<div class="plp-row plp-warn">⚠ ${h(p.healer)} is not a healer class - only a healer class heals</div>` : ''}
      <div class="plp-two">
        <div><div class="muted">Leveler</div>HP ${pct(a.hp)} · MP ${pct(a.mp)} · lvl ${h(a.level || '?')}${a.dead ? ' · <b>DEAD</b>' : ''}${a.expHour != null ? ` · exp ${h(a.expHour)} %/h` : ''}<div class="muted">${h(a.task || '')}</div></div>
        <div><div class="muted">Healer</div>HP ${pct(b.hp)} · MP ${pct(b.mp)}${b.dead ? ' · <b>DEAD</b>' : ''} · ${L.dist != null ? h(L.dist) + ' away' : 'distance ?'}
          <div class="muted">${L.lastCast ? `last cast ${h(L.lastCast.skill)} on ${h(L.lastCast.target)} at ${h(hm(L.lastCast.at))}` : 'no cast yet'}${L.lastBuff ? ` · last buff ${h(L.lastBuff.skill)} at ${h(hm(L.lastBuff.at))}` : ''}${L.why ? ' · ' + h(L.why) : ''}</div></div></div>
      <div class="plp-row">
        <label><input type="checkbox" data-plpaoe="${h(p.leveler)}"${p.aoe ? ' checked' : ''}> AOE pull (area skills from 2 monsters)</label>
        <label><input type="checkbox" data-plpbuff="${h(p.leveler)}"${p.buffs !== false ? ' checked' : ''}> Healer buffs the leveler (its own class buffs; a stronger board buff stays)</label>
        <label>Heal at <input type="number" min="20" max="95" value="${h(p.healAt)}" data-plpheal="${h(p.leveler)}"> %</label>
        <label>Keep distance <input type="number" min="200" max="1500" step="50" value="${h(p.keepDist)}" data-plpkeep="${h(p.leveler)}"></label></div>
      <div class="plp-row"><span>Spot: ${p.spot ? `<b>${h(p.spot.name)}</b> <span class="muted">(${h(p.spot.x)}, ${h(p.spot.y)}, r ${h(p.spot.radius)})</span>` : '<span class="muted">the leveler\'s own party spot / automatic - no level limits</span>'}</span>
        <button type="button" data-plphere="${h(p.leveler)}">Use where ${h(p.leveler)} stands now</button>
        ${p.spot ? `<button type="button" data-plpclear="${h(p.leveler)}">Clear spot</button>` : ''}</div>
    </div>`;
  }
  function render() {
    const s = section(), d = S.d;
    if (!d) { s.innerHTML = `<h2>Power level</h2><div class="muted">${S.err ? 'Could not load: ' + h(S.err) : 'Loading…'}</div>`; return; }
    const R = d.roster || [], used = new Set((d.pairs || []).flatMap(p => [p.leveler, p.healer]));
    const free = R.filter(c => !used.has(c.name));
    const healers = free.filter(c => c.healer).concat(free.filter(c => !c.healer));
    s.innerHTML = `<h2>Power level</h2>
      <div class="muted">A LEVELER hunts alone in its own party (all the exp) with <b>no level limits</b>, while a HEALER from another party follows it, heals and resurrects it (never attacks). Nothing runs until you press Start.</div>
      <div class="plp-msg" id="plpMsg" hidden></div>
      <h3>New pair</h3><div class="plp-box"><div class="plp-row">
        <label>Leveler <select id="plpLv">${optList(free, S.lv)}</select></label>
        <label>Healer <select id="plpHl">${optList(healers, S.hl, true)}</select></label>
        <button type="button" id="plpAdd">Make the pair (OFF)</button></div>
        <div class="muted">✚ = healer class. The healer must not be in the leveler's party (the exp would be shared) - use "Move to party" on the character page.</div></div>
      <h3>Pairs (${(d.pairs || []).length})</h3>${(d.pairs || []).length ? d.pairs.map(pairCard).join('') : '<div class="plp-box muted">No pair yet.</div>'}
      <div class="muted">Updated ${h(hm(d.at))} · orders: !pl start &lt;leveler&gt; / !pl stop &lt;leveler&gt;</div>`;
  }
  async function post(body, msg) {
    let r = null; try { r = await api('/api/powerlevel', { method: 'POST', body: JSON.stringify(body) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { flash('Not saved: ' + ((r && r.error) || '?'), true); return false; }
    if (msg) flash(msg); load(); return true;
  }
  const pairOf = (lv) => ((S.d && S.d.pairs) || []).find(p => p.leveler === lv);
  async function onClick(e) {
    const t = e.target, g = (q) => t.closest(q); let b;
    if ((b = g('#plpAdd'))) { const lv = $id('plpLv').value, hl = $id('plpHl').value; if (!lv || !hl) { flash('Pick a leveler and a healer', true); return; }
      if (await post({ op: 'set', pair: { leveler: lv, healer: hl, on: false, aoe: false, healAt: 70, keepDist: 700 } }, `Pair made: ${lv} levels, ${hl} heals - press Start when ready`)) { S.lv = ''; S.hl = ''; } return; }
    if ((b = g('[data-plpon]'))) { const lv = b.dataset.plpon, on = b.dataset.v === '1', p = pairOf(lv);
      const ok = typeof uiConfirm === 'function' ? await uiConfirm({ title: on ? `Start power leveling ${lv}?` : `Stop power leveling ${lv}?`, body: on ? [uiP(`${lv} hunts with NO level limits while ${p ? p.healer : 'its healer'} follows and heals it.`)] : undefined, confirmText: on ? 'Start' : 'Stop' }) : true;
      if (ok) post({ op: 'onoff', leveler: lv, on }, on ? `${lv}: power leveling ON` : `${lv}: OFF`); return; }
    if ((b = g('[data-plpdel]'))) { const lv = b.dataset.plpdel; const ok = typeof uiConfirm === 'function' ? await uiConfirm({ title: `Delete the pair of ${lv}?`, confirmText: 'Delete' }) : true; if (ok) post({ op: 'delete', leveler: lv }, 'Pair deleted'); return; }
    if ((b = g('[data-plphere]'))) { post({ op: 'herespot', leveler: b.dataset.plphere }, 'Spot set to where the leveler stands now'); return; }
    if ((b = g('[data-plpclear]'))) { const p = pairOf(b.dataset.plpclear); if (p) post({ op: 'set', pair: Object.assign({}, p, { spot: null, clearSpot: true }) }, 'Spot cleared'); return; }
  }
  function onChange(e) {
    const t = e.target, d = t.dataset;
    if (t.id === 'plpLv') { S.lv = t.value; return; } if (t.id === 'plpHl') { S.hl = t.value; return; }
    const lv = d.plpaoe || d.plpbuff || d.plpheal || d.plpkeep; const p = lv && pairOf(lv); if (!p) return;
    const np = Object.assign({}, p); delete np.live; delete np.warn;
    if (d.plpaoe) np.aoe = !!t.checked; if (d.plpbuff) np.buffs = !!t.checked;   // PLBUFF-2026-11-03 if (d.plpheal) np.healAt = Number(t.value); if (d.plpkeep) np.keepDist = Number(t.value);
    post({ op: 'set', pair: np }, 'Saved');
  }
  window.PowerLevelPage = { route, open, close, load, _state: S };
})();
