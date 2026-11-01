// AOE TEAM page #/aoe[/<leader>] (AOETEAM-2026-10-30; owner: "I wanna a page dedicated for this" ... "It should be like a hunting Ground you setup, then
// you can select which team should go there. If melee team then they should get polearms etc" ... "I wanna see the rooms under AOE just like hunting so
// i can click off inside a Dungeon" ... "Should be easy, Compact and Nice to use").
//  * AOE grounds (set up once): HERE WE ALL STAND (camp), the healers' place, the damage dealers' place, THE PULLERS' ROUTES (AOEROLES-2026-10-30,
//    owner: "you should be able to create multiple Pullers' routes and assign each character to a class. So Who is healer, who is standing still, who
//    is a puller etc.") - placed on the hunting spot map (every dungeon / floor / room: window.openSpotPickerAoe in index.html) or from a character's
//    position.
//  * Teams: per party the ground, the mode (Tank AOE / Polearm AOE, suggested from who is in it), a ROLE per character (tap: Tank -> Healer -> Damage
//    dealer -> Puller; a puller picks its route), on / off; "Send team there" = the ground becomes the party's hunting spot.
// Dashboard/aoeteam_api.js -> Scripts/data/aoe_teams.json (swarm.js AOETEAM reads it every 5 s). index.html globals: esc, api, TAB, floorTiles,
// uiConfirm. No browser alerts.
(function () {
  'use strict';
  const SEC = 'tab-aoepage';
  const A = { open: false, info: null, edit: null, team: {}, exp: {}, who: '', msgT: 0, timer: 0, focus: '' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  const TANK_RE = /^(sk|tank|pk|dk|paladin|knight|templar)/i, MELEE_RE = /destroyer|doombringer|inspector|gladiator|warlord|tyrant|titan|dreadnought|duelist|berserker|melee|fighter/i, NUKE_RE = /mage|necro|sorc|spellhowler|spellsinger|wizard|archmage|soultaker|mystic|summoner|nuker/i;
  const PLACES = [['camp', 'We all stand', '#f2c94c'], ['healers', 'Healers', '#5fd35f'], ['dealers', 'Damage dealers', '#ff6b5e']];
  const COLS = ['#5aa9ff', '#c77dff', '#ff9f43', '#2ee6a6', '#ff6bcb', '#ffd166'];   // = index.html SPM_AOE_COLS
  const ROLE = { tank: ['🛡', 'Tank'], healer: ['✚', 'Healer'], dealer: ['⚔', 'Damage dealer'], puller: ['🏃', 'Puller'] }, ROLE_ORDER = ['tank', 'healer', 'dealer', 'puller'];
  const blankGround = () => ({ id: '', name: '', camp: null, healers: null, dealers: null, routes: [{ id: 'r1', name: 'Route 1', points: [] }], rooms: [], areaIds: [], standMaxSec: 4, clearMaxSec: 120, speedBuffs: true, tag: true });
  // AOEROOMS-2026-10-30 (owner: "Should also be able to edit the already created AOE hunting spot. AND it should be possible to select more rooms")
  const roomsText = (g, sp) => (g.rooms || []).length ? `${g.rooms[0].dungeon} · ${g.rooms.length} room${g.rooms.length === 1 ? '' : 's'}: ${g.rooms.map(r => r.name || r.roomId).join(', ')}`
    : (g.areaIds || []).length ? `${g.areaIds.length} field area${g.areaIds.length === 1 ? '' : 's'}` : sp ? sp.label.replace(/ \(AOE ground.*$/, '') + ' (the camp\'s room)' : 'not in a known room / area';
  const parties = () => (A.info && A.info.parties) || [];
  const grounds = () => obj(A.info && A.info.grounds);
  const routesOf = (g) => (g && Array.isArray(g.routes) && g.routes.length ? g.routes : g && Array.isArray(g.route) && g.route.length ? [{ id: 'r1', name: 'Route 1', points: g.route }] : []);
  const fmtP = (p) => p ? `${p.x}, ${p.y}` : '—';
  function flash(t, bad) { const m = $id('aoeMsg'); if (!m) return; m.hidden = false; m.className = 'cpl-msg' + (bad ? ' bad' : ''); m.textContent = t; clearTimeout(A.msgT); A.msgT = setTimeout(() => { m.hidden = true; }, bad ? 12000 : 7000); }
  function suggestMode(P) {
    const roles = (P ? P.members : []).map(m => m.role || ''), melee = roles.filter(r => MELEE_RE.test(r) && !TANK_RE.test(r)).length, nukers = roles.filter(r => NUKE_RE.test(r)).length;
    return melee >= 2 && melee >= nukers ? 'polearm' : 'tank';
  }
  function teamOf(L) {
    if (A.team[L]) return A.team[L];
    const t = obj(obj(A.info && A.info.teams)[L]), P = parties().find(p => p.leader === L);
    const roles = JSON.parse(JSON.stringify(obj(obj(A.info && A.info.roles)[L]).constructor === Object && Object.keys(obj(obj(A.info && A.info.roles)[L])).length ? A.info.roles[L] : obj(obj(A.info && A.info.suggested)[L])));
    (P ? P.members : []).forEach(m => { if (!roles[m.name]) roles[m.name] = { role: 'dealer' }; });
    return (A.team[L] = { on: t.on === true, ground: t.ground || '', mode: t.mode || suggestMode(P), roles, saved: !!t.ground, dirty: false });
  }
  async function load() {
    let d = null;
    try { d = await api('/api/aoeteam'); } catch (e) { flash('The dashboard server has no AOE team API yet (it needs a restart).', true); render(); return; }
    if (!d || d.error) { flash((d && d.error) || 'no answer', true); render(); return; }
    if (d.broken) flash(`aoe_teams.json does not parse (${d.broken}) — saving is blocked until it is fixed or restored from Scripts/data/history/.`, true);
    A.info = d; Object.keys(A.team).forEach(L => { if (!A.team[L].dirty) delete A.team[L]; });
    render();
  }

  // ============================================================================================ the small preview map
  function preview(g) {
    const R = routesOf(g), all = [].concat(...R.map(r => r.points || []));
    const c = g.camp || all[0]; if (!c) return '<div class="aoe-prev muted">Nothing placed yet — use “Pick on the map”.</div>';
    const pts = [g.camp, g.healers, g.dealers].concat(all).filter(Boolean), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const size = Math.max(1500, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.35), cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const x0 = cx - size / 2, y0 = cy - size / 2, u = size / 320;
    let s = ''; try { if (typeof floorTiles === 'function') s = floorTiles('aoe:' + (g.id || 'new'), { x: c.x, y: c.y, z: c.z || 0 }, x0, y0, size, size, u).imgs; } catch (e) { }
    R.forEach((r, ri) => { const P = r.points || [], col = COLS[ri % COLS.length]; if (!P.length) return;
      s += `<polyline points="${P.concat(g.camp ? [g.camp] : []).map(p => p.x + ',' + p.y).join(' ')}" fill="none" stroke="${col}" stroke-width="${3 * u}" stroke-dasharray="${8 * u} ${6 * u}"/>`;
      P.forEach((p, i) => { s += `<circle cx="${p.x}" cy="${p.y}" r="${7 * u}" fill="${col}" stroke="#000" stroke-width="${u}"/><text x="${p.x}" y="${p.y + 3.5 * u}" font-size="${9 * u}" text-anchor="middle">${i + 1}</text>`; }); });
    PLACES.forEach(([k, , col]) => { const p = g[k]; if (p) s += `<circle cx="${p.x}" cy="${p.y}" r="${9 * u}" fill="${col}" stroke="#000" stroke-width="${1.5 * u}"/>`; });
    return `<svg class="aoe-prev" viewBox="${x0} ${y0} ${size} ${size}" role="img" aria-label="preview of the AOE ground">${s}</svg>`;
  }

  // ============================================================================================ render
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win cpl aoe'; s.hidden = true;
    s.innerHTML = `<div class="cpl-headrow"><h2>AOE teams</h2><span class="muted cpl-intro">Set up an AOE ground once (where everyone stands + the pullers' routes), then give each character its role and send the team there.</span></div>
      <div class="cpl-msg" id="aoeMsg" role="status" hidden></div><div id="aoeBody"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('change', onChange); s.addEventListener('input', onInput);
    return s;
  }
  // AOELOOK-2026-10-31 (owner on the 1920 px page: "The format of the page looks extremely bad"): cards, aligned grids, a large sticky map,
  // dashboard switches, one primary action, only the parties that have an AOE team (+ "Add a team")
  const sw = (attr, on, label, sub) => `<button type="button" class="uk-switch" role="switch" aria-checked="${!!on}" ${attr}><span class="uk-track"><span class="uk-knob"></span></span><span class="uk-sl"><b>${h(label)}</b><span>${h(sub)}</span></span></button>`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function groundRows() {
    const G = grounds(), S = obj(A.info && A.info.spots), T = obj(A.info && A.info.teams), ids = Object.keys(G).sort((a, b) => String(G[a].name).localeCompare(String(G[b].name)));
    if (!ids.length) return '<div class="aoe-empty muted">No AOE ground yet — make one with “+ New AOE ground”.</div>';
    return `<div class="aoe-glist">${ids.map(id => { const g = G[id], R = routesOf(g), used = Object.keys(T).filter(L => T[L].ground === id), sp = S[id];
      return `<button type="button" class="aoe-gc${A.edit && A.edit.id === id ? ' on' : ''}" data-aoeedit="${h(id)}" title="edit this AOE ground"><b>${h(g.name)}</b>
        <span class="muted">${h(roomsText(g, sp))}</span>
        <span class="aoe-gmeta">${R.map((r, i) => `<i class="aoe-dot" style="background:${COLS[i % COLS.length]}"></i>${(r.points || []).length}`).join(' ')} <span class="muted">${plural(R.length, 'route')}</span>${used.length ? ` · <span class="muted">teams</span> ${h(used.join(', '))}` : ''}</span>
        <span class="aoe-gedit">Edit ›</span></button>`; }).join('')}</div>`;
  }
  function editor() {
    const E = A.edit; if (!E) return '';
    const g = E.w, P = parties(), who = P.map(p => `<optgroup label="${h(p.leader)}">${p.members.map(m => `<option value="${h(m.name)}"${A.who === m.name ? ' selected' : ''}>${h(m.name)}</option>`).join('')}</optgroup>`).join('');
    const sp = E.id ? obj(A.info && A.info.spots)[E.id] : null, RM = g.rooms || [], AR = g.areaIds || [];
    const ib = (attr, txt, title, cls) => `<button type="button" class="aoe-ib${cls ? ' ' + cls : ''}" ${attr} title="${h(title)}" aria-label="${h(title)}">${txt}</button>`, gap = '<span></span>';
    const prow = ([k, label, col]) => `<i class="aoe-dot" style="background:${col}"></i><b>${label}</b><span class="aoe-xy${g[k] ? '' : ' muted'}">${g[k] ? fmtP(g[k]) : k === 'camp' ? 'not set (needed)' : '= at the camp'}</span>
      ${ib(`data-aoefrom="${k}"`, '⌖', 'set it to the chosen character\'s position now')}${g[k] && k !== 'camp' ? ib(`data-aoeclear="${k}"`, '✕', 'clear (= at the camp)') : gap}`;
    const R = g.routes;
    const rrow = (r, i) => `<i class="aoe-dot" style="background:${COLS[i % COLS.length]}"></i><input class="aoe-rname" data-aoerename="${i}" value="${h(r.name)}" maxlength="30" aria-label="route name"><span class="aoe-xy muted">${plural((r.points || []).length, 'point')}</span>
      ${ib(`data-aoepick="${i}"`, '🗺', `add / change the points of ${r.name} on the map`)}${ib(`data-aoefromr="${i}"`, '+⌖', 'add the chosen character\'s position as the next point')}${(r.points || []).length ? ib(`data-aoeundor="${i}"`, '↶', 'remove the last point') : gap}${R.length > 1 ? ib(`data-aoedelr="${i}"`, '🗑', 'delete this route', 'bad') : gap}`;
    const roomChips = RM.length ? `<span class="aoe-chip">${h(RM[0].dungeon)}</span>${RM.map((r, i) => `<span class="aoe-chip"><b>${i + 1}</b> ${h(r.name || r.roomId)}</span>`).join('')}`
      : AR.length ? AR.map((a, i) => `<span class="aoe-chip"><b>${i + 1}</b> area ${h(a)}</span>`).join('')
      : `<span class="muted">${sp ? `Only the camp's room: ${h(sp.label.replace(/ \(AOE ground.*$/, ''))}` : g.camp ? 'Only the camp\'s room (found when you save)' : 'Set the camp, or pick the rooms on the map'}</span>`;
    return `<div class="box aoe-ed"><div class="aoe-edhead"><h3>${E.id ? 'Edit AOE ground' : 'New AOE ground'}</h3><input id="aoeName" class="aoe-name" value="${h(g.name)}" placeholder="Name, e.g. Cruma 2F Ossiud train" maxlength="60" aria-label="name of the AOE ground"></div>
      <div class="aoe-cols"><div class="aoe-form">
        <section class="aoe-sec"><div class="aoe-sech"><b>Rooms</b><span class="muted">the team hunts all of them; pullers may run between them</span></div>
          <div class="aoe-chips">${roomChips}</div>
          <div class="aoe-acts"><button type="button" class="uk-btn secondary" data-aoepick="${E.cur}">🗺 Pick rooms on the map</button>${RM.length || AR.length ? '<button type="button" class="aoe-link" data-aoeclearrooms>clear the rooms</button>' : ''}</div></section>
        <section class="aoe-sec"><div class="aoe-sech"><b>Places</b><span class="muted">⌖ = where <select id="aoeWho" aria-label="character whose position ⌖ uses">${who}</select> stands now</span></div>
          <div class="aoe-grid aoe-gp">${PLACES.map(prow).join('')}</div></section>
        <section class="aoe-sec"><div class="aoe-sech"><b>Pullers' routes</b><span class="muted">each puller runs its own route, then back to the camp</span></div>
          <div class="aoe-grid aoe-gr">${R.map(rrow).join('')}</div>
          ${R.length < 6 ? '<div class="aoe-acts"><button type="button" class="aoe-link" data-aoeaddr>+ Add a route</button></div>' : ''}</section>
        <section class="aoe-sec"><div class="aoe-sech"><b>Timing</b></div>
          <label class="aoe-num"><span>Pullers stand at the camp at most</span><span><input id="aoeStand" inputmode="numeric" value="${h(g.standMaxSec)}"> s</span></label>
          <label class="aoe-num"><span>A tank who pulls waits for the kill at most</span><span><input id="aoeClear" inputmode="numeric" value="${h(g.clearMaxSec)}"> s</span></label>
          ${sw('data-aoesw="speedBuffs"', g.speedBuffs !== false, 'Speed buffs before every pull', 'Dash / Sprint / Wind Walk / Haste, else a Haste Potion')}
          ${sw('data-aoesw="tag"', g.tag !== false, 'Tag the monsters at each route point', 'one quick aggro cast, never a fight')}</section>
      </div><div class="aoe-mapcol">${preview(g)}<div class="aoe-legend">${PLACES.map(([, l, c]) => `<span><i class="aoe-dot" style="background:${c}"></i>${l}</span>`).join('')}${R.map((r, i) => `<span><i class="aoe-dot" style="background:${COLS[i % COLS.length]}"></i>${h(r.name)}</span>`).join('')}</div>
        <button type="button" class="uk-btn secondary full" data-aoepick="${E.cur}">🗺 Open the map (places, routes, rooms)</button></div></div>
      <div class="aoe-foot"><button type="button" class="uk-btn primary" data-aoegsave>${E.dirty ? 'Save the ground' : 'Saved ✓'}</button><button type="button" class="uk-btn" data-aoegclose>Close</button>
        <span class="muted">${E.dirty ? 'not saved yet' : ''}</span>${E.id ? '<button type="button" class="aoe-link bad aoe-del" data-aoegdel>Delete this ground</button>' : ''}</div></div>`;
  }
  function roleChip(L, m, t, R) {
    const r = t.roles[m.name] || { role: 'dealer' }, [ic, lab] = ROLE[r.role] || ROLE.dealer;
    const sel = r.role === 'puller' && R.length > 1 ? `<select data-aoerroute="${h(L)}|${h(m.name)}" aria-label="route of ${h(m.name)}">${R.map((x, i) => `<option value="${h(x.id)}"${x.id === r.route ? ' selected' : ''}>${h(x.name)}</option>`).join('')}</select>` : '';
    const ri = Math.max(0, R.findIndex(x => x.id === r.route)), col = r.role === 'puller' ? COLS[ri % COLS.length] : '';
    return `<span class="aoe-rc role-${r.role}"${col ? ` style="border-color:${col}"` : ''}><button type="button" data-aoerole="${h(L)}|${h(m.name)}" title="${h(m.cls || m.role)} — tap to change: Tank → Healer → Damage dealer → Puller"><span class="ic">${ic}</span>${h(m.name)}<small>${lab}</small></button>${sel}</span>`;
  }
  function teamRows() {
    const G = grounds(), ids = Object.keys(G), S = obj(A.info && A.info.spots);
    if (!ids.length) return '<div class="aoe-empty muted">Make an AOE ground first, then add a team.</div>';
    const T = obj(A.info && A.info.teams), hasTeam = (L) => !!(T[L] && T[L].ground) || !!(A.team[L] && (A.team[L].ground || A.team[L].dirty));
    const withT = parties().filter(P => hasTeam(P.leader)), rest = parties().filter(P => !hasTeam(P.leader));
    const cards = withT.map(P => {
      const L = P.leader, t = teamOf(L), sug = suggestMode(P), R = routesOf(G[t.ground]), open = A.exp[L] !== undefined ? A.exp[L] : (A.focus === L || t.dirty || !t.saved);
      const gOpts = `<option value="">— no AOE —</option>` + ids.map(id => `<option value="${h(id)}"${t.ground === id ? ' selected' : ''}>${h(G[id].name)}</option>`).join('');
      const melee = P.members.filter(m => (t.roles[m.name] || {}).role === 'dealer' && MELEE_RE.test(m.role) && !TANK_RE.test(m.role)).map(m => m.name);
      const cnt = ROLE_ORDER.map(k => [k, P.members.filter(m => (t.roles[m.name] || {}).role === k).length]).filter(x => x[1]).map(([k, n]) => `${ROLE[k][0]} ${n}`).join('  ');
      const head = `<button type="button" class="aoe-th" data-aoeexp="${h(L)}" aria-expanded="${open}"><span class="aoe-st ${t.on ? 'on' : ''}">${t.on ? 'ON' : 'off'}</span><b>${h(L)}</b>
        <span class="muted aoe-thg">${h((G[t.ground] || {}).name || 'no ground')} · ${t.mode === 'polearm' ? 'Polearm AOE' : 'Tank AOE'}</span><span class="aoe-thc">${cnt}</span>${t.dirty ? '<span class="aoe-dirty">not saved</span>' : ''}<span class="aoe-chev">${open ? '▾' : '▸'}</span></button>`;
      if (!open) return `<div class="aoe-tc${t.on ? ' is-on' : ''}">${head}</div>`;
      return `<div class="aoe-tc open${t.on ? ' is-on' : ''}${A.focus === L ? ' focus' : ''}">${head}<div class="aoe-tb">
        <div class="aoe-tf"><label><span class="muted">AOE ground</span><span class="aoe-inl"><select data-aoetg="${h(L)}" aria-label="AOE ground">${gOpts}</select>${t.ground && G[t.ground] ? `<button type="button" class="aoe-ib" data-aoeeditg="${h(t.ground)}" title="edit this AOE ground (places, routes, rooms)" aria-label="edit this AOE ground">✎</button>` : ''}</span></label>
          <label><span class="muted">Mode</span><select data-aoetm="${h(L)}" aria-label="mode"><option value="tank"${t.mode === 'tank' ? ' selected' : ''}>Tank AOE${sug === 'tank' ? ' (suggested)' : ''}</option><option value="polearm"${t.mode === 'polearm' ? ' selected' : ''}>Polearm AOE${sug === 'polearm' ? ' (suggested)' : ''}</option></select></label>
          ${sw(`data-aoeton="${h(L)}"`, t.on, 'Use the AOE team', t.on ? 'on: the bots run it at the camp' : 'off: the party hunts normally')}</div>
        ${t.ground ? `<div class="aoe-sech"><b>Roles</b><span class="muted">tap a name: Tank → Healer → Damage dealer → Puller</span><button type="button" class="aoe-link" data-aoesugg="${h(L)}">use the suggested roles</button></div>
          <div class="aoe-roles">${P.members.map(m => roleChip(L, m, t, R)).join('')}</div>
          ${melee.length ? `<div class="muted aoe-small">${h(melee.join(', '))}: polearm for packs of 2+ monsters (from what we own, else bought at the next Giran trip), their own weapon for a single one</div>` : ''}` : '<div class="muted aoe-small">Choose an AOE ground to give the characters their roles.</div>'}
        <div class="aoe-foot"><button type="button" class="uk-btn primary" data-aoetsave="${h(L)}"${t.dirty ? '' : ' disabled'}>Save</button>
          ${t.ground && t.saved ? `<button type="button" class="uk-btn secondary" data-aoesend="${h(L)}"${S[t.ground] ? '' : ' disabled title="the camp is not in a known room / area"'}>Send team there ›</button>` : ''}
          ${t.saved ? `<button type="button" class="aoe-link bad aoe-del" data-aoeremove="${h(L)}">Remove the AOE team</button>` : ''}</div></div></div>`;
    }).join('');
    const add = rest.length ? `<div class="aoe-add"><select id="aoeAddP" aria-label="party">${rest.map(P => `<option value="${h(P.leader)}">${h(P.leader)} (${P.members.length})</option>`).join('')}</select>
      <select id="aoeAddG" aria-label="AOE ground">${ids.map(id => `<option value="${h(id)}">${h(G[id].name)}</option>`).join('')}</select><button type="button" class="uk-btn secondary" data-aoeaddteam>+ Add a team</button></div>` : '';
    return (cards || '<div class="aoe-empty muted">No party has an AOE team yet.</div>') + add;
  }
  function render() {
    section(); const b = $id('aoeBody'); if (!b) return;
    if (!A.info) { b.innerHTML = '<div class="box muted">Loading…</div>'; return; }
    const keep = window.scrollY;
    b.innerHTML = `<div class="aoe-layout"><div class="box aoe-card"><div class="aoe-cardh"><h3>AOE grounds</h3><button type="button" class="uk-btn primary" data-aoenew>+ New AOE ground</button></div>${groundRows()}</div>
      ${editor()}
      <div class="box aoe-card"><div class="aoe-cardh"><h3>Teams</h3></div>${teamRows()}
        <details class="aoe-help"><summary>What the roles do</summary><div class="muted aoe-small">🛡 Tank stands at the camp and takes the pack (Tank AOE: Ultimate Defense + Aura of Hate / Mass Hate) · ✚ Healer stands at the healers' place and only heals · ⚔ Damage dealer stands at the damage dealers' place (melee: polearm for packs) · 🏃 Puller runs ITS route the whole way without stopping, then back to the camp. Nobody runs after a puller.</div></details></div></div>`;
    if (Math.abs(window.scrollY - keep) > 2) window.scrollTo(0, keep);
  }

  // ============================================================================================ events
  const touchE = () => { if (A.edit) { A.edit.dirty = true; render(); } };
  const charPos = () => { const n = ($id('aoeWho') || {}).value; for (const P of parties()) { const m = P.members.find(x => x.name === n); if (m) return m.x || m.y ? { x: m.x, y: m.y, z: m.z } : null; } return null; };
  const syncRoute = (w) => { w.route = w.routes[0] ? w.routes[0].points : []; };
  function onClick(ev) {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-aoenew')) { A.edit = { id: '', w: blankGround(), dirty: false, cur: 0 }; render(); return; }
    if (t.dataset.aoeedit) { const g = grounds()[t.dataset.aoeedit]; if (g) { const w = Object.assign(blankGround(), JSON.parse(JSON.stringify(g))); w.routes = JSON.parse(JSON.stringify(routesOf(g))); if (!w.routes.length) w.routes = blankGround().routes; A.edit = { id: g.id, w, dirty: false, cur: 0 }; render(); } return; }
    if (t.hasAttribute('data-aoegclose')) { A.edit = null; render(); return; }
    if (A.edit && t.dataset.aoefrom) { const p = charPos(); if (!p) { flash('That character has no position (offline?)', true); return; } A.edit.w[t.dataset.aoefrom] = p; touchE(); return; }
    if (A.edit && t.dataset.aoefromr !== undefined) { const p = charPos(); if (!p) { flash('That character has no position (offline?)', true); return; } const i = Number(t.dataset.aoefromr); A.edit.cur = i; A.edit.w.routes[i].points.push(p); syncRoute(A.edit.w); touchE(); return; }
    if (A.edit && t.dataset.aoeclear) { A.edit.w[t.dataset.aoeclear] = null; touchE(); return; }
    // AOELOOK: switches, team cards open / closed, add / remove a team
    if (A.edit && t.dataset.aoesw) { const k = t.dataset.aoesw; A.edit.w[k] = A.edit.w[k] === false; touchE(); return; }
    if (t.dataset.aoeton !== undefined) { const T = teamOf(t.dataset.aoeton); if (!T.ground && !T.on) { flash('Choose an AOE ground first.', true); return; } T.on = !T.on; T.dirty = true; render(); return; }
    if (t.dataset.aoeexp !== undefined) { const L = t.dataset.aoeexp, T = teamOf(L); A.exp[L] = !(A.exp[L] !== undefined ? A.exp[L] : (A.focus === L || T.dirty || !T.saved)); render(); return; }
    if (t.hasAttribute('data-aoeaddteam')) { const L = ($id('aoeAddP') || {}).value, gid = ($id('aoeAddG') || {}).value; if (!L || !gid) return; const T = teamOf(L); T.ground = gid; T.dirty = true; A.exp[L] = true; A.focus = L; render(); return; }
    if (t.dataset.aoeremove) { removeTeam(t.dataset.aoeremove); return; }
    if (A.edit && t.hasAttribute('data-aoeclearrooms')) { A.edit.w.rooms = []; A.edit.w.areaIds = []; touchE(); return; }
    if (t.dataset.aoeeditg) { const g = grounds()[t.dataset.aoeeditg]; if (g) { const w = Object.assign(blankGround(), JSON.parse(JSON.stringify(g))); w.routes = JSON.parse(JSON.stringify(routesOf(g))); if (!w.routes.length) w.routes = blankGround().routes; A.edit = { id: g.id, w, dirty: false, cur: 0 }; render(); const ed = document.querySelector('.aoe-ed'); if (ed && ed.scrollIntoView) ed.scrollIntoView({ block: 'start', behavior: 'smooth' }); } return; }
    if (A.edit && t.dataset.aoeundor !== undefined) { const i = Number(t.dataset.aoeundor); A.edit.w.routes[i].points.pop(); syncRoute(A.edit.w); touchE(); return; }
    if (A.edit && t.dataset.aoedelr !== undefined) { delRoute(Number(t.dataset.aoedelr)); return; }
    if (A.edit && t.hasAttribute('data-aoeaddr')) { const w = A.edit.w; let k = w.routes.length + 1; while (w.routes.some(r => r.id === 'r' + k)) k++; w.routes.push({ id: 'r' + k, name: 'Route ' + (w.routes.length + 1), points: [] }); A.edit.cur = w.routes.length - 1; touchE(); return; }
    if (A.edit && t.dataset.aoepick !== undefined) { A.edit.cur = Number(t.dataset.aoepick) || 0; pickOnMap(); return; }
    if (t.hasAttribute('data-aoegsave')) { saveGround(); return; }
    if (t.hasAttribute('data-aoegdel')) { delGround(); return; }
    if (t.dataset.aoerole) { const [L, n] = t.dataset.aoerole.split('|'), T = teamOf(L), cur = (T.roles[n] || {}).role || 'dealer', nx = ROLE_ORDER[(ROLE_ORDER.indexOf(cur) + 1) % ROLE_ORDER.length], R = routesOf(grounds()[T.ground]);
      T.roles[n] = nx === 'puller' ? { role: 'puller', route: (R[0] || {}).id || 'r1' } : { role: nx }; T.dirty = true; render(); return; }
    if (t.dataset.aoesugg) { const L = t.dataset.aoesugg, T = teamOf(L); T.roles = JSON.parse(JSON.stringify(obj(obj(A.info.suggested)[L]))); T.dirty = true; render(); return; }
    if (t.dataset.aoetsave) { saveTeam(t.dataset.aoetsave); return; }
    if (t.dataset.aoesend) { sendTeam(t.dataset.aoesend); return; }
  }
  async function delRoute(i) {
    const w = A.edit.w, r = w.routes[i]; if (!r || w.routes.length < 2) return;
    if ((r.points || []).length && typeof uiConfirm === 'function' && !(await uiConfirm({ title: `Delete “${r.name}”?`, body: `${r.points.length} points. Pullers on it switch to the first route when you save their team.`, confirmText: 'Delete' }))) return;
    w.routes.splice(i, 1); A.edit.cur = 0; syncRoute(w); touchE();
  }
  function onChange(ev) {
    const t = ev.target;
    if (t.dataset.aoetg !== undefined) { const T = teamOf(t.dataset.aoetg); T.ground = t.value; T.dirty = true; if (!t.value) T.on = false; render(); return; }
    if (t.dataset.aoetm !== undefined) { const T = teamOf(t.dataset.aoetm); T.mode = t.value; T.dirty = true; render(); return; }
    if (t.id === 'aoeWho') { A.who = t.value; return; }
    if (t.dataset.aoerroute !== undefined) { const [L, n] = t.dataset.aoerroute.split('|'), T = teamOf(L); T.roles[n] = { role: 'puller', route: t.value }; T.dirty = true; render(); return; }
    if (!A.edit) return;
  }
  function onInput(ev) {
    const t = ev.target; if (!A.edit) return;
    if (t.dataset.aoerename !== undefined) { const r = A.edit.w.routes[Number(t.dataset.aoerename)]; if (r) r.name = t.value; A.edit.dirty = true; const b = document.querySelector('[data-aoegsave]'); if (b) b.disabled = false; return; }
    const map = { aoeName: 'name', aoeStand: 'standMaxSec', aoeClear: 'clearMaxSec' }; if (!map[t.id]) return;
    A.edit.w[map[t.id]] = t.value; A.edit.dirty = true; const b = document.querySelector('[data-aoegsave]'); if (b) b.disabled = false;
  }
  function pickOnMap() {
    if (typeof window.openSpotPickerAoe !== 'function') { flash('The hunting spot map is not available on this page version (reload: Ctrl+F5).', true); return; }
    const L = (Object.keys(obj(A.info.teams)).find(k => A.info.teams[k].ground === A.edit.id) || (parties()[0] || {}).leader || '');
    const E = A.edit;
    window.openSpotPickerAoe(L, Object.assign({}, E.w, { cur: E.cur }), (w) => { E.w = Object.assign(E.w, { camp: w.camp || null, healers: w.healers || null, dealers: w.dealers || null, routes: Array.isArray(w.routes) && w.routes.length ? w.routes : E.w.routes, rooms: Array.isArray(w.rooms) ? w.rooms : [], areaIds: Array.isArray(w.areaIds) ? w.areaIds : [] }); syncRoute(E.w); E.dirty = true; A.edit = E; setTimeout(render, 50); });
  }
  async function post(body, ok) {
    try { const d = await api('/api/aoeteam', { method: 'POST', body: JSON.stringify(Object.assign({ rev: A.info && A.info.rev, by: 'dashboard (AOE page)' }, body)) });
      if (!d || !d.ok) { flash(`Not saved: ${(d && d.error) || 'no answer'}`, true); if (d && d.conflict) await load(); return null; }
      flash(ok); await load(); return d;
    } catch (e) { flash('Not saved: ' + e.message, true); return null; }
  }
  async function saveGround() {
    const E = A.edit; if (!E) return; syncRoute(E.w);
    const d = await post({ ground: Object.assign({}, E.w, { id: E.id || undefined }) }, `AOE ground “${E.w.name}” saved (${E.w.routes.length} route${E.w.routes.length === 1 ? '' : 's'}).`);
    if (d) { const g = grounds()[d.id || E.id]; A.edit = g ? { id: g.id, w: Object.assign(blankGround(), JSON.parse(JSON.stringify(g)), { routes: JSON.parse(JSON.stringify(routesOf(g))) }), dirty: false, cur: 0 } : null; render(); }
  }
  async function delGround() {
    const E = A.edit; if (!E || !E.id) return;
    if (typeof uiConfirm === 'function' && !(await uiConfirm({ title: `Delete the AOE ground “${E.w.name}”?`, body: 'Teams must use another ground first.', confirmText: 'Delete' }))) return;
    if (await post({ groundDelete: E.id }, `AOE ground “${E.w.name}” deleted.`)) { A.edit = null; render(); }
  }
  const teamBody = (T, on) => ({ on: on === undefined ? T.on : on, ground: T.ground, mode: T.mode, roles: T.roles });
  async function saveTeam(L) {
    const T = teamOf(L), P = Object.keys(T.roles).filter(n => T.roles[n].role === 'puller');
    const d = T.ground ? await post({ party: L, team: teamBody(T) }, `Party ${L}: AOE team ${T.on ? 'ON' : 'off'} at “${(grounds()[T.ground] || {}).name}” (${T.mode === 'polearm' ? 'Polearm AOE' : 'Tank AOE'}, pullers ${P.join(', ') || 'none'}). The bots use it within 5 s.`)
      : await post({ party: L, team: null }, `Party ${L}: no AOE team any more.`);
    if (d) { delete A.team[L]; render(); }
  }
  async function removeTeam(L) {
    if (typeof uiConfirm === 'function' && !(await uiConfirm({ title: `Remove the AOE team of ${L}?`, body: 'The party hunts normally again; the AOE ground stays.', confirmText: 'Remove' }))) return;
    if (await post({ party: L, team: null }, `Party ${L}: no AOE team any more.`)) { delete A.team[L]; delete A.exp[L]; render(); }
  }
  async function sendTeam(L) {
    const T = teamOf(L), sp = obj(A.info.spots)[T.ground]; if (!sp) return;
    if (typeof uiConfirm === 'function' && !(await uiConfirm({ title: `Send party ${L} to “${(grounds()[T.ground] || {}).name}”?`, body: `Their hunting spot becomes ${sp.label.replace(/ \(AOE ground.*$/, '')}; they travel there and run the AOE (${T.mode === 'polearm' ? 'Polearm' : 'Tank'} AOE) at the camp.`, confirmText: 'Send them' }))) return;
    try {
      if (!T.on || T.dirty) { T.on = true; await post({ party: L, team: teamBody(T, true) }, `Party ${L}: AOE team ON.`); delete A.team[L]; }
      const d = await api('/api/partyspot', { method: 'POST', body: JSON.stringify(Object.assign({ party: L }, sp.body)) });
      if (!d || d.error) { flash(`Hunting spot not set: ${(d && d.error) || 'no answer'}`, true); return; }
      flash(`Party ${L} goes to ${sp.label.replace(/ \(AOE ground.*$/, '')} — the AOE starts at the camp when they arrive.`);
    } catch (e) { flash(e.message, true); }
  }

  // ============================================================================================ route
  function open(arg) { A.open = true; section().hidden = false; A.focus = arg || ''; load(); clearInterval(A.timer); A.timer = setInterval(() => { if (A.open && !document.hidden && !(A.edit && A.edit.dirty) && !Object.values(A.team).some(t => t.dirty)) load(); }, 15000); }
  function route(kind, arg) {
    if (kind !== 'aoe') { close(); return false; }
    try { document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; }); } catch (e) { }
    try { TAB = 'aoe'; } catch (e) { }
    try { const T = document.getElementById('tabs'); if (T) [...T.children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'aoe')); } catch (e) { }   // the menu button lights up
    open(arg ? decodeURIComponent(arg) : ''); return true;
  }
  function close() { if (!A.open) return; A.open = false; clearInterval(A.timer); A.timer = 0; const s = $id(SEC); if (s) s.hidden = true; }
  window.AoePage = { route, open, close, _state: A };
})();
