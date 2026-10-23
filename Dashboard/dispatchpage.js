// DISPATCH page #/dispatch (DISPATCH-2026-10-17; owner: "dispatch a party or a solo person to a point in game ... Baium, Valakas teleport,
// Antharas, Core, Sailren ... go to X, go to Y, go to Z, so we can verify that all the routes are working ... auto learn the path").
// 1) Who: a party (its leader takes it) or one character (optional: sneak = Silent Move near monsters, no fighting)  2) Where: epic quick
// buttons, search over every nav atlas place (raid bosses, epics, NPCs, hunting areas, rooms, dungeons) or a map point; each shows the computed
// route's status and our last dispatch there  3) the tour (several stops, in order)  4) Go -> live, stop by stop (swarm.js DISPATCH: computed
// route, else another way that is recorded and saved as the learned route). Data: /api/dispatch/* (Dashboard/dispatch_api.js).
// Uses index.html globals: api, classIcon, stopChar, TAB; uidialog: uiConfirm, uiP, uiNote, uiError; UIKit.toast.
// COMPACT-2026-10-23 (owner: "make /dispatch more compact and user friendly"): PC = two columns (left: who + where, right: the tour with Go,
// sticky, live progress, recent tours folded); phone = one column, compact strips that scroll sideways, the tour above the place list and a
// sticky "N stops · Go" bar at the bottom. Styles live in this file (one <style>, scoped to #tab-dispatch).
(function () {
  'use strict';
  const SEC = 'tab-dispatch';
  const S = { open: false, who: null, mode: 'party', sneak: false, enter: false, goOn: false, q: '', type: 'all', res: null, quick: null, stops: [], job: null, poll: 0, recent: null, msgT: 0, px: '', py: '', pz: '' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (p) => typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png';
  const gim = (p, c) => `<img class="gim${c ? ' ' + c : ''}" src="${ico(p)}" alt="">`;   // in-game icons only (owner 2026-10-17)
  const TI = { raid: 'icon/accessory_raid_master_i00', epic: 'icon/accessory_ring_of_baium_i00', npc: 'L2UI_CT1/crop/Icon_DF_MenuWnd_Character', area: 'L2UI_CT1/crop/Icon_DF_MenuWnd_Map', room: 'L2UI_CT1/crop/Icon_DF_MenuWnd_Quest', dungeon: 'L2UI_CT1/ICON_DF_SIEGE_SHIELD', point: 'icon/etc_map_yellow_i00' };
  const EPIC_ICON = [[/Baium/, 'icon/accessory_ring_of_baium_i00'], [/Valakas|Klein/, 'icon/accessory_necklace_of_valakas_i00'], [/Core/, 'icon/accessory_ring_of_core_i00'], [/Queen Ant/, 'icon/accessory_ring_of_queen_ant_i00'], [/Orfen/, 'icon/accessory_earring_of_orfen_i00'], [/Zaken/, 'icon/accessory_earring_of_zaken_i00'], [/Frintezza/, 'icon/accessory_necklace_of_frintessa_i00']];
  const iconOf = (t) => { const e = EPIC_ICON.find(([re]) => re.test(String(t.label || t.name))); return gim(e ? e[1] : (TI[t.type] || TI.point), 'big'); };   // each epic its own jewel
  const TYPES = [['all', 'Everything'], ['raid', 'Raid bosses'], ['epic', 'Epics'], ['npc', 'NPCs'], ['area', 'Hunting areas'], ['room', 'Rooms'], ['dungeon', 'Dungeons']];
  const ST = { ok: ['✓', 'route ok', '#3fa35a'], conditional: ['!', 'route with a condition', '#c9a23a'], unverified: ['?', 'route not checked yet', '#8a8a8a'], blocked: ['✗', 'route blocked', '#c0503f'], unreachable: ['✗', 'no route', '#c0503f'] };
  const km = (n) => !(n > 0) ? '' : n >= 1000 ? (n / 1000).toFixed(1) + ' k' : Math.round(n) + '';
  const mins = (s) => !(s > 0) ? '' : s >= 60 ? Math.round(s / 60) + ' min' : s + ' s';
  const running = () => !!(S.job && !(S.job.status && /done|failed/.test(S.job.status.state)));

  const CSS = `
#tab-dispatch { min-width: 0; padding-bottom: 70px; }
#tab-dispatch .gim { width: 20px; height: 20px; vertical-align: middle; border-radius: 3px; }
#tab-dispatch .gim.big { width: 28px; height: 28px; }
#tab-dispatch .whead h2 { display: flex; align-items: center; gap: 6px; margin: 0; }
#tab-dispatch .dsp-msg { margin: 6px 0; padding: 6px 10px; border: 1px solid #2f5a3c; background: rgba(23, 58, 34, .55); border-radius: 3px; color: #c9f0d2; font-size: var(--fs-cap); }
#tab-dispatch .dsp-msg.bad { border-color: #8f2f24; background: rgba(74, 23, 20, .7); color: #ffc9bf; }
#tab-dispatch .dsp-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
#tab-dispatch .dsp-side { display: contents; }
@media (min-width: 1000px) {
  #tab-dispatch .dsp-grid { grid-template-columns: minmax(0, 1fr) minmax(320px, 400px); align-items: start; }
  #tab-dispatch .dsp-side { display: block; position: sticky; top: 8px; max-height: calc(100vh - 16px); overflow-y: auto; }
  #tab-dispatch .dsp-bar { display: none !important; }
}
#tab-dispatch .dsp-h { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 2px 0 6px; font-size: var(--fs-section); color: var(--gold); font-weight: 600; }
#tab-dispatch .dsp-h .dsp-num { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: #6b5424; color: #fff; align-items: center; justify-content: center; font-size: var(--fs-cap); }
#tab-dispatch .dsp-h .muted { font-weight: 400; }
@media (max-width: 640px) { #tab-dispatch .dsp-h > .muted { flex: 1 1 100%; } }
#tab-dispatch .dsp-box { margin: 0 0 10px; }
#tab-dispatch .dsp-seg { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
#tab-dispatch .dsp-seg button { min-height: 40px; display: inline-flex; align-items: center; gap: 5px; padding: 2px 12px; }
#tab-dispatch .dsp-seg button.on, #tab-dispatch .dsp-chip.on { outline: 2px solid var(--gold); color: var(--gold); }
#tab-dispatch .dsp-strip { display: flex; gap: 6px; flex-wrap: wrap; max-height: 196px; overflow-y: auto; padding: 2px; overscroll-behavior: contain; }
#tab-dispatch .dsp-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 3px 10px 3px 5px; text-align: left; flex: none; }
#tab-dispatch .dsp-chip img { width: 24px; height: 24px; flex: none; }
#tab-dispatch .dsp-chip span { display: flex; flex-direction: column; line-height: 1.15; }
#tab-dispatch .dsp-chip small { color: var(--muted); font-size: var(--fs-mini); }
#tab-dispatch .dsp-search { width: 100%; box-sizing: border-box; min-height: 40px; margin: 0 0 6px; }
#tab-dispatch .dsp-quick { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
#tab-dispatch .dsp-q { display: inline-flex; flex-direction: row; align-items: center; gap: 6px; min-height: 44px; padding: 3px 10px 3px 4px; text-align: left; border-radius: 0; }
#tab-dispatch .dsp-qi { font-size: inherit; line-height: 0; flex: none; }
#tab-dispatch .dsp-q span.dsp-ql { display: flex; flex-direction: column; line-height: 1.15; }
#tab-dispatch .dsp-q b { font-size: var(--fs-cap); }
#tab-dispatch .dsp-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; border: 1px solid #000; flex: none; }
#tab-dispatch .dsp-qs { font-size: var(--fs-mini); color: var(--muted); display: inline-flex; align-items: center; gap: 4px; }
#tab-dispatch .dsp-types { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
#tab-dispatch .dsp-types button { min-height: 36px; padding: 2px 10px; display: inline-flex; align-items: center; gap: 4px; }
#tab-dispatch .dsp-types button.on { outline: 2px solid var(--gold); color: var(--gold); }
#tab-dispatch .dsp-st { display: inline-block; font-size: var(--fs-mini); color: #fff; padding: 0 6px; border-radius: 8px; white-space: nowrap; }
#tab-dispatch .dsp-last { display: inline-block; font-size: var(--fs-mini); padding: 0 6px; border-radius: 8px; background: rgba(255,255,255,.07); white-space: nowrap; }
#tab-dispatch .dsp-last.ok { color: #8fd19e; } #tab-dispatch .dsp-last.bad { color: #ff9b8f; }
#tab-dispatch .dsp-listhead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; margin: 4px 0; }
#tab-dispatch .dsp-listhead button { min-height: 36px; }
#tab-dispatch .dsp-list { display: flex; flex-direction: column; gap: 3px; max-height: 62vh; overflow-y: auto; overscroll-behavior: contain; }
#tab-dispatch .dsp-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 2px 8px; border: 1px solid var(--line); background: var(--box); border-radius: 3px; padding: 4px 6px; }
#tab-dispatch .dsp-main { min-width: 0; }
#tab-dispatch .dsp-main b { font-size: var(--fs-body); }
#tab-dispatch .dsp-sub { display: flex; flex-wrap: wrap; gap: 3px 6px; align-items: center; margin-top: 1px; }
#tab-dispatch .dsp-add { min-width: 64px; min-height: 40px; font-size: var(--fs-cap); border-radius: 0; }
#tab-dispatch .dsp-add.in { color: var(--ok); }
#tab-dispatch .dsp-point summary { min-height: 40px; display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--muted); font-size: var(--fs-cap); }
#tab-dispatch .dsp-pt { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0 8px; }
#tab-dispatch .dsp-pt input { width: 100px; min-height: 40px; box-sizing: border-box; }
#tab-dispatch .dsp-pt button { min-height: 40px; }
#tab-dispatch .dsp-tourbox { border: 1px solid var(--line2); }
#tab-dispatch .dsp-tour { list-style: none; margin: 0 0 6px; padding: 0; counter-reset: st; }
#tab-dispatch .dsp-tour li { display: grid; grid-template-columns: 20px 28px minmax(0, 1fr) auto; align-items: center; gap: 4px 6px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.06); counter-increment: st; }
#tab-dispatch .dsp-tour li::before { content: counter(st); color: var(--gold); font: 600 var(--fs-cap) Consolas, monospace; text-align: center; }
#tab-dispatch .dsp-tour li b { min-width: 0; font-size: var(--fs-cap); overflow-wrap: anywhere; }
#tab-dispatch .dsp-mv { display: flex; gap: 2px; }
#tab-dispatch .dsp-mv button { min-width: 36px; min-height: 36px; padding: 0; }
#tab-dispatch .dsp-who { font-size: var(--fs-cap); margin: 0 0 6px; }
#tab-dispatch .dsp-opt summary { cursor: pointer; min-height: 36px; display: flex; align-items: center; color: var(--muted); font-size: var(--fs-cap); }
#tab-dispatch .dsp-check { display: flex; gap: 8px; align-items: center; margin: 4px 0; min-height: 36px; font-size: var(--fs-cap); line-height: 1.3; }
#tab-dispatch .dsp-go { width: 100%; min-height: 48px; font-size: var(--fs-em); display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
#tab-dispatch .dsp-hint { font-size: var(--fs-cap); color: var(--muted); text-align: center; margin: 4px 0 0; }
#tab-dispatch .dsp-job { border: 1px solid var(--line); border-radius: 3px; padding: 6px 8px; margin: 8px 0 0; font-size: var(--fs-cap); }
#tab-dispatch .dsp-job.done { border-color: #3fa35a; } #tab-dispatch .dsp-job.failed { border-color: #c0503f; }
#tab-dispatch .dsp-job ol { margin: 4px 0 0 18px; padding: 0; color: var(--muted); }
#tab-dispatch .dsp-ok { color: #8fd19e; } #tab-dispatch .dsp-bad { color: #ff9b8f; }
#tab-dispatch .dsp-learn { color: #9fd0ff; }
#tab-dispatch .dsp-recent summary { cursor: pointer; min-height: 36px; display: flex; align-items: center; color: var(--muted); font-size: var(--fs-cap); }
#tab-dispatch .dsp-rec { border-top: 1px solid rgba(255,255,255,.06); padding: 4px 0; font-size: var(--fs-cap); }
#tab-dispatch .dsp-bar { position: sticky; bottom: 0; z-index: 5; display: flex; align-items: center; gap: 8px; margin: 8px -4px 0; padding: 8px; background: #15140f; border-top: 1px solid var(--line2); box-shadow: 0 -4px 10px rgba(0,0,0,.5); }
#tab-dispatch .dsp-bar span { flex: 1; min-width: 0; font-size: var(--fs-cap); }
#tab-dispatch .dsp-bar button { min-height: 44px; padding: 0 14px; }
@media (max-width: 640px) {
  #tab-dispatch .dsp-strip, #tab-dispatch .dsp-quick, #tab-dispatch .dsp-types { flex-wrap: nowrap; overflow-x: auto; max-height: none; padding-bottom: 4px; scrollbar-width: thin; }
  #tab-dispatch .dsp-q, #tab-dispatch .dsp-types button { flex: none; }
  #tab-dispatch .dsp-types button, #tab-dispatch .dsp-seg button, #tab-dispatch .dsp-search, #tab-dispatch .dsp-listhead button, #tab-dispatch .dsp-mv button { min-height: 44px; }
  #tab-dispatch .dsp-mv button { min-width: 40px; }
  #tab-dispatch .dsp-add { min-height: 44px; }
  #tab-dispatch .dsp-list { max-height: none; }
}`;
  async function loadWho() { try { const d = await api('/api/dispatch/who'); if (d && !d.error) S.whoData = d; } catch (e) { } render(); }
  async function loadQuick() { try { const d = await api('/api/dispatch/targets?quick=1'); if (d && !d.error) S.quick = d.targets; } catch (e) { } render(); }
  async function loadRecent() { try { const d = await api('/api/dispatch/recent'); if (d && !d.error) S.recent = d.jobs; } catch (e) { } render(); }
  let searchT = 0;
  let searchSeq = 0;
  function search() { clearTimeout(searchT); const my = ++searchSeq; searchT = setTimeout(async () => { try { const d = await api(`/api/dispatch/targets?q=${encodeURIComponent(S.q)}&type=${S.type}&n=80`); if (my !== searchSeq) return; if (d && !d.error) S.res = d; } catch (e) { } renderList(); }, 250); }   // a late answer to an older search never replaces the newer one

  function section() {
    let s = $id(SEC); if (s) return s;
    if (!$id('dspCss')) { const st = document.createElement('style'); st.id = 'dspCss'; st.textContent = CSS; document.head.appendChild(st); }
    s = document.createElement('section'); s.id = SEC; s.className = 'win dsp'; s.hidden = true;
    s.innerHTML = `<div class="whead"><h2>${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Map', 'gi')} Dispatch</h2><span class="muted">Send a party or one character to one place or a tour of places</span></div>
      <div class="dsp-msg" id="dspMsg" role="status" hidden></div>
      <div class="dsp-grid">
        <div class="dsp-left"><div class="box dsp-box" id="dspWho"></div><div class="dsp-mtour" id="dspTourSlotPhone"></div><div class="box dsp-box"><div id="dspWhere"></div><div id="dspList"></div></div></div>
        <div class="dsp-side"><div class="box dsp-box dsp-tourbox"><div id="dspTour"></div><div id="dspJob"></div></div><div id="dspRecent"></div></div>
      </div>
      <div class="dsp-bar" id="dspBar" hidden></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('input', onInput); s.addEventListener('change', onInput);
    placeTour(); window.addEventListener('resize', placeTour);
    return s;
  }
  // phone: the tour box sits between "who" and "where" (above the long list); PC: in the sticky right column
  function placeTour() {
    const box = $id('dspTour') && $id('dspTour').parentElement; if (!box) return;
    const wide = window.matchMedia ? window.matchMedia('(min-width: 1000px)').matches : innerWidth >= 1000;
    const want = wide ? document.querySelector('#tab-dispatch .dsp-side') : $id('dspTourSlotPhone');
    if (want && box.parentElement !== want) want.insertBefore(box, want.firstChild);
  }
  function route(kind) { if (kind === 'dispatch') { open(); return true; } close(); return false; }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'dispatch'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'dispatch')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; placeTour();
    render(); loadWho(); loadQuick(); loadRecent(); search();
    setTimeout(() => { try { if (s.getBoundingClientRect().top > 40) s.scrollIntoView({ block: 'start' }); } catch (e) { } }, 300);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); const s = $id(SEC); if (s) s.hidden = true; }
  function flash(t, bad) { const m = $id('dspMsg'); if (!m) return; m.hidden = !t; m.className = 'dsp-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; clearTimeout(S.msgT); S.msgT = setTimeout(() => { const x = $id('dspMsg'); if (x) x.hidden = true; }, bad ? 15000 : 7000); }
  const stChip = (t) => { const s = ST[t.status] || ['', t.status || '', '#777']; return `<span class="dsp-st" style="background:${s[2]}" title="${h(s[1])}">${s[0]} ${h(s[1])}</span>`; };
  const stDot = (t) => { const s = ST[t.status] || ['', t.status || 'unknown', '#777']; return `<span class="dsp-qs" title="${h(s[1])}"><i class="dsp-dot" style="background:${s[2]}"></i>${h(s[1])}</span>`; };
  const lastChip = (t) => t.last ? `<span class="dsp-last ${t.last.ok ? 'ok' : 'bad'}" title="${h(t.last.how || t.last.why || '')}">${t.last.ok ? '✓ we got there' : '✗ we did not get there'} ${h(new Date(t.last.at).toLocaleDateString())}${t.last.learned ? ' · learned' : ''}</span>` : '';
  const whoName = (W) => W ? (W.char ? W.char : 'party ' + W.party) : '';
  const inTour = (key) => S.stops.some(s => s.key === key);

  function render() {
    if (!S.open) return; section();
    const W = S.whoData;
    // 1. who
    let who = `<div class="dsp-h"><span class="dsp-num">1</span> Who goes? ${S.who ? `<b>${h(whoName(S.who))}</b>` : '<span class="muted">tap one</span>'}</div>
      <div class="dsp-seg" role="group" aria-label="A party or one character"><button type="button" class="${S.mode === 'party' ? 'on' : ''}" data-dspmode="party" aria-pressed="${S.mode === 'party'}">${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Clan')} A party</button><button type="button" class="${S.mode === 'char' ? 'on' : ''}" data-dspmode="char" aria-pressed="${S.mode === 'char'}">${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Character')} One character</button></div>`;
    const ci = (m) => typeof classIcon === 'function' ? classIcon({ name: m.name, classId: m.classId, cls: m.cls }) : '';
    if (!W) who += '<div class="muted">Loading…</div>';
    else if (S.mode === 'party') who += `<div class="dsp-strip">${W.parties.filter(p => p.members.length > 1).map(p => `<button type="button" class="dsp-chip${S.who && S.who.party === p.leader ? ' on' : ''}" data-dspparty="${h(p.leader)}" aria-pressed="${!!(S.who && S.who.party === p.leader)}">${p.members[0] ? ci(p.members[0]) : ''}<span><b>party ${h(p.leader)}</b><small>${p.members.length} characters${p.members[0] && p.members[0].level ? ' · lvl ' + h(p.members[0].level) : ''}</small></span></button>`).join('')}</div>`;
    else who += `<input type="search" class="dsp-search" id="dspCq" placeholder="Search a character…" value="${h(S.cq || '')}" autocomplete="off"><div class="dsp-strip">${W.chars.filter(c => !S.cq || c.name.toLowerCase().includes(S.cq.toLowerCase())).map(c => `<button type="button" class="dsp-chip${S.who && S.who.char === c.name ? ' on' : ''}" data-dspchar="${h(c.name)}" aria-pressed="${!!(S.who && S.who.char === c.name)}">${ci(c)}<span><b>${h(c.name)}</b><small>${c.level ? 'lvl ' + h(c.level) : ''}${c.party && c.party !== c.name ? ' · party ' + h(c.party) : ''}${c.online ? '' : ' · offline'}</small></span></button>`).join('')}</div>`;
    $id('dspWho').innerHTML = who;
    // 2. where
    $id('dspWhere').innerHTML = `<div class="dsp-h"><span class="dsp-num">2</span> Where to? <span class="muted">tap Add — several places make a tour</span></div>
      ${S.quick ? `<div class="dsp-quick">${S.quick.map(t => `<button type="button" class="dsp-q" data-dspadd="${h(t.key)}" title="${h(t.label)}${t.last ? ' — ' + (t.last.ok ? 'we got there' : 'we did not get there') + ' ' + new Date(t.last.at).toLocaleDateString() : ''}"><span class="dsp-qi">${iconOf(t)}</span><span class="dsp-ql"><b>${h(t.label)}</b>${stDot(t)}</span></button>`).join('')}</div>` : ''}
      <div class="dsp-types" role="group" aria-label="Kind of place">${TYPES.map(([k, t]) => `<button type="button" class="${S.type === k ? 'on' : ''}" data-dsptype="${k}" aria-pressed="${S.type === k}">${TI[k] ? gim(TI[k]) + ' ' : ''}${t}</button>`).join('')}</div>
      <input type="search" class="dsp-search" id="dspQ" placeholder="Search a place, boss or NPC…" value="${h(S.q)}" autocomplete="off">
      <details class="dsp-point"><summary>${gim('icon/etc_map_yellow_i00')} Or a point on the map (x, y)</summary><div class="dsp-pt"><input id="dspPx" type="number" inputmode="numeric" placeholder="x" value="${h(S.px)}"><input id="dspPy" type="number" inputmode="numeric" placeholder="y" value="${h(S.py)}"><input id="dspPz" type="number" inputmode="numeric" placeholder="z (optional)" value="${h(S.pz)}"><button type="button" data-dsppoint="1">Add</button></div></details>`;
    renderList(); renderTour(); renderJob(); renderRecent();
  }
  function renderRecent() {
    const el = $id('dspRecent'); if (!el) return;
    const keep = el.querySelector('details') && el.querySelector('details').open;
    el.innerHTML = S.recent && S.recent.length ? `<details class="box dsp-box dsp-recent"${keep ? ' open' : ''}><summary>Recent tours (${S.recent.length})</summary>${S.recent.map(j => { const st = j.status || {}; return `<div class="dsp-rec ${st.state || ''}"><b>${h(j.who.char || 'party ' + j.who.party)}</b> <span class="muted">${h(new Date(j.created).toLocaleString())}</span><div>${h(j.stops.join(' → '))}</div><div class="${st.state === 'done' ? 'dsp-ok' : st.state === 'failed' ? 'dsp-bad' : 'muted'}">${h(st.state === 'done' ? '✓ ' + (st.result || '') : st.state === 'failed' ? '✗ ' + (st.result || '') : st.step ? '… ' + st.step : 'waiting to start')}</div></div>`; }).join('')}</details>` : '';
  }
  function renderList() {
    const el = $id('dspList'); if (!el) return;
    const R = S.res; if (!R) { el.innerHTML = '<div class="muted">Loading…</div>'; return; }
    el.innerHTML = `<div class="dsp-listhead"><span class="muted">${R.total} place${R.total === 1 ? '' : 's'}${R.total > R.targets.length ? ', showing ' + R.targets.length + ' — search to narrow' : ''}</span>${R.targets.length > 1 ? `<button type="button" data-dspaddall="1" title="Add every place shown (max 40) to check the routes">Add all shown</button>` : ''}</div>
      <div class="dsp-list">${R.targets.map(t => `<div class="dsp-row"><span class="dsp-qi">${iconOf(t)}</span><div class="dsp-main"><b>${h(t.name)}</b><div class="dsp-sub">${stChip(t)} ${lastChip(t)} <span class="muted">${km(t.length)}${t.sec ? ' · about ' + mins(t.sec) : ''}</span></div></div><button type="button" class="dsp-add${inTour(t.key) ? ' in' : ''}" data-dspadd="${h(t.key)}" aria-label="Add ${h(t.name)}">${inTour(t.key) ? '✓ Added' : 'Add'}</button></div>`).join('') || '<div class="muted">Nothing found.</div>'}</div>`;
  }
  function renderTour() {
    const el = $id('dspTour'); if (!el) return;
    const W = S.who, n = S.stops.length, busy = running();
    const nOpt = [S.goOn, S.enter, S.mode === 'char' && S.sneak].filter(Boolean).length;
    const hint = busy ? 'A tour is on the way — see below.' : !W && !n ? 'Pick who goes and add a place.' : !W ? 'Pick who goes (step 1).' : !n ? 'Add a place (step 2).' : '';
    el.innerHTML = `<div class="dsp-h">${gim('icon/etc_scroll_of_return_i00')} Your tour ${n ? `<span class="muted">${n} stop${n > 1 ? 's' : ''}</span>` : ''}</div>
      ${W ? `<div class="dsp-who">Who: <b>${h(whoName(W))}</b></div>` : ''}
      ${n ? `<ol class="dsp-tour">${S.stops.map((t, i) => `<li><span class="dsp-qi">${iconOf(t)}</span><b>${h(t.label || t.name)}</b><span class="dsp-mv"><button type="button" data-dspmv="${i}|-1" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button type="button" data-dspmv="${i}|1" ${i < n - 1 ? '' : 'disabled'} aria-label="Move down">▼</button><button type="button" data-dspdel="${i}" aria-label="Remove">✕</button></span></li>`).join('')}</ol>` : '<div class="muted">No stops yet.</div>'}
      <details class="dsp-opt"><summary>Options${nOpt ? ` (${nOpt} on)` : ''}</summary>
        <label class="dsp-check"><input type="checkbox" data-dspgoon="1"${S.goOn ? ' checked' : ''}> Keep going to the next stop when one fails</label>
        <label class="dsp-check"><input type="checkbox" data-dspenter="1"${S.enter ? ' checked' : ''}> Go into an epic boss zone when the entry item is in the bag (else it stops at the door)</label>
        ${S.mode === 'char' ? `<label class="dsp-check"><input type="checkbox" data-dspsneak="1"${S.sneak ? ' checked' : ''}> ${gim('icon/skill0221')} Sneak: Silent Move near monsters, no fighting, back to town below 40 % HP</label>` : ''}</details>
      <button type="button" class="go dsp-go" data-dspgo="1" ${W && n && !busy ? '' : 'disabled'}>${gim('icon/etc_scroll_of_return_i00')} Go${W && n ? ` — ${h(whoName(W))}, ${n} stop${n > 1 ? 's' : ''}` : ''}</button>
      ${hint ? `<div class="dsp-hint">${h(hint)}</div>` : ''}`;
    const bar = $id('dspBar');
    if (bar) { bar.hidden = !n; bar.innerHTML = n ? `<span><b>${n} stop${n > 1 ? 's' : ''}</b>${W ? ' · ' + h(whoName(W)) : ' · pick who goes'}</span><button type="button" data-dspjump="1">Review</button><button type="button" class="go" data-dspgo="1" ${W && !busy ? '' : 'disabled'}>Go</button>` : ''; }
    if ($id('dspList') && S.res) renderList();
  }
  function renderJob() {
    const el = $id('dspJob'); if (!el) return; const J = S.job;
    if (!J) { el.innerHTML = ''; return; }
    const st = J.status || {};
    el.innerHTML = `<div class="dsp-job ${st.state || ''}"><b>${st.state === 'done' ? '✓ Arrived' : st.state === 'failed' ? '✗ Stopped' : 'On the way…'}</b>${st.result ? ' — ' + h(st.result) : ''}
      ${(st.stops || []).length ? `<div>${st.stops.map(s => `<div class="${s.ok ? 'dsp-ok' : 'dsp-bad'}">${s.ok ? '✓' : '✗'} <b>${h(s.name)}</b> ${h(s.ok ? s.how : s.why)}${s.learned ? ` <span class="dsp-learn">${gim('L2UI_CT1/crop/Icon_DF_MenuWnd_Map')} ${h(s.learned)}</span>` : ''} <span class="muted">${mins(s.sec)}</span></div>`).join('')}</div>` : ''}
      <ol>${(st.steps || []).slice(-12).map(s => `<li>${h(new Date(s.t).toLocaleTimeString())} ${h(s.msg)}</li>`).join('') || '<li>waiting to start…</li>'}</ol></div>`;
  }
  async function go() {
    const W = S.who; if (!W || !S.stops.length) return;
    const wname = whoName(W);
    const ok = await uiConfirm({ title: `Dispatch ${wname}?`, body: [uiP(S.stops.map((t, i) => `${i + 1}. ${t.label || t.name}`).join('\n')),
      uiNote(`${W.char ? 'It' : 'The party'} stops what it does, travels stop by stop and waits at the last one. A route that fails is solved another way and the way that worked is saved.${W.char && S.whoData && (S.whoData.chars.find(c => c.name === W.char) || {}).party !== W.char ? ' A party member sent alone is benched (its party carries on without it; switch it on again on its character page).' : ''}`)], confirmText: 'Go' });
    if (!ok) return;
    let r = null; try { r = await api('/api/dispatch', { method: 'POST', body: JSON.stringify({ who: W, stops: S.stops.map(t => t.key), sneak: S.sneak, enter: S.enter, goOn: S.goOn }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { uiError((r && r.error) || 'not sent', 'Not sent'); return; }
    S.job = { id: r.id, status: null }; renderJob(); renderTour();
    if (window.UIKit) UIKit.toast(`${wname}: on the way${r.benched ? ' (benched from its party)' : ''}`, { kind: 'ok' });
    clearInterval(S.poll);
    S.poll = setInterval(async () => {
      if (!S.open || !S.job) { clearInterval(S.poll); return; }
      try { const d = await api('/api/dispatch/job?id=' + encodeURIComponent(S.job.id)); if (d && !d.error) { S.job.status = d.status; renderJob(); if (d.status && /done|failed/.test(d.status.state)) { clearInterval(S.poll); renderTour(); loadRecent(); search(); loadQuick(); } } } catch (e) { }
    }, 3000);
  }
  function addKey(key) {
    if (S.stops.length >= 40) { flash('At most 40 stops in one tour.', true); return; }
    const t = (S.res && S.res.targets.find(x => x.key === key)) || (S.quick || []).find(x => x.key === key);
    if (!t) return; S.stops.push(Object.assign({}, t)); renderTour(); flash(`Added: ${t.label || t.name}`);
  }
  function onClick(e) {
    const t = e.target, g = (s) => t.closest(s); let b;
    if ((b = g('[data-dspmode]'))) { S.mode = b.dataset.dspmode; S.who = null; render(); return; }
    if ((b = g('[data-dspparty]'))) { S.who = { party: b.dataset.dspparty }; render(); return; }
    if ((b = g('[data-dspchar]'))) { S.who = { char: b.dataset.dspchar }; render(); return; }
    if ((b = g('[data-dsptype]'))) { S.type = b.dataset.dsptype; render(); search(); return; }
    if ((b = g('[data-dspadd]'))) { addKey(b.dataset.dspadd); return; }
    if (g('[data-dspaddall]')) { (S.res ? S.res.targets : []).slice(0, 40 - S.stops.length).forEach(x => S.stops.push(Object.assign({}, x))); renderTour(); return; }
    if (g('[data-dsppoint]')) { const x = Math.round(Number(S.px)), y = Math.round(Number(S.py)), z = S.pz === '' ? null : Math.round(Number(S.pz)); if (!isFinite(x) || !isFinite(y) || (!x && !y)) { flash('Type x and y.', true); return; } S.stops.push({ key: `xy:${x},${y}${z != null && isFinite(z) ? ',' + z : ''}`, type: 'point', name: `point ${x}, ${y}` }); renderTour(); return; }
    if ((b = g('[data-dspmv]'))) { const [i, d] = b.dataset.dspmv.split('|').map(Number), j = i + d; if (j < 0 || j >= S.stops.length) return; [S.stops[i], S.stops[j]] = [S.stops[j], S.stops[i]]; renderTour(); return; }
    if ((b = g('[data-dspdel]'))) { S.stops.splice(Number(b.dataset.dspdel), 1); renderTour(); return; }
    if (g('[data-dspjump]')) { const x = $id('dspTour'); if (x) x.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (g('[data-dspgo]')) { go(); return; }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'dspQ') { if (e.type === 'input') { S.q = t.value; search(); } return; }
    if (t.id === 'dspCq') { if (e.type !== 'input') return; S.cq = t.value; const pos = t.selectionStart; render(); const x = $id('dspCq'); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (er) { } } return; }
    if (t.id === 'dspPx') S.px = t.value; if (t.id === 'dspPy') S.py = t.value; if (t.id === 'dspPz') S.pz = t.value;
    if (t.dataset.dspsneak) S.sneak = t.checked; if (t.dataset.dspgoon) S.goOn = t.checked; if (t.dataset.dspenter) S.enter = t.checked;
    if (e.type === 'change' && (t.dataset.dspsneak || t.dataset.dspgoon || t.dataset.dspenter)) { const d = t.closest('details'); const s = d && d.querySelector('summary'); const n = [S.goOn, S.enter, S.mode === 'char' && S.sneak].filter(Boolean).length; if (s) s.textContent = 'Options' + (n ? ` (${n} on)` : ''); }
  }
  window.DispatchPage = { route, open, close, _state: S };
})();
