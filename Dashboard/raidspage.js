// RAIDS PAGE v2 (user 2026-10-09 11:05: "Under /raids it's annoying that 'Saved routes' are not collapsed by default. Also it could use an insane
// makeover just like the other pages, with animations, compact information that makes sense. Also the saved routes look like some of the
// characters made their own routes to destinations?").
//
// Pages (index.html route() hook: RaidsPage.route(kind, arg), after the spot / shape editors): #/raids = the boss board, #/raid/<id> = one boss.
// Replaces the old Raids tab + old boss page while this file is loaded; without it (server not restarted yet) the old pages keep working, and
// every old function is still reachable from here (raidhunt start/stop, raid orders, filters, saved routes + route editor, fight area,
// live view, reports, loot log, daily dungeons, drops, kill / respawn history).
// Board: pinned LIVE raid (link to the live views) + the raidhunt line of every party (hunting: phase + Next queue; idle: what it would take
// next) + one compact card per boss: status with a live respawn countdown, curse-safe level, which parties it fits (+ distance from their
// leader), fight-area / route badges, the last kill + its loot. Filters (fits the party / up now / respawn soon / dead, region, level, text)
// and sort (level / respawn / distance / name) are remembered per viewer (localStorage). "Saved routes" is COLLAPSED by default (remembered):
// these are LEARNED walks (landing -> boss) a party leader saved after a successful trip, or routes drawn on the dashboard — never a character's
// own wandering. Grouped per boss, with origin (who / when), uses / fails, locked, and Map / Lock / Delete.
// Data (read-only GETs; the orders go through the old confirmOrder + send, the route lock/delete through POST /api/route like the old editor):
//   /api/raids 30 s · /api/routes 60 s · /api/raidhunt 3 s · /api/raidloot 30 s · /api/raidreports + /api/daily only while their section is open
//   LIVE (index.html pollLive, every 1 s) · STATE (index.html refresh, every 4 s: party leader positions for the distances)
// Uses index.html globals: esc, api, patch, go, km, GI, UI, gauge, itemIcon, partyColor, STATE, TAB, navDepth, confirmOrder, send, pref, setPref,
// LIVE, huntPhase, HUNT_PHASES, huntBadge, huntAgo, hhmm, lootHtml, rrHtml, rrCard, dailyHtml, bossHistHtml, routeEditor, raidAreaInfo,
// raidAreasRefresh, RAIDAREAS, liveHtml, stopChar.
(function () {
  'use strict';
  const SEC = 'tab-raidspage';
  const TOWNS = { Gludin: [-80786, 150251], Gludio: [-12712, 122776], Dion: [15619, 143132], Giran: [83473, 148554], Oren: [82760, 53578], Aden: [147448, 25816],
    Hunters: [116589, 76268], Heine: [111381, 218981], Goddard: [147732, -56554], Rune: [43759, -48122], Schuttgart: [87355, -142095] };
  const EPIC = /^(Queen Ant|Core|Orfen|Zaken|Baium|Antharas|Valakas|Frintezza|Scarlet van Halisha|Beleth|Freya|Sailren|Baylor|Lilith|Anakim|Tiat|Ekimus|Istina|Octavis)\b/i;
  const RP = { open: false, mode: '', bossId: null, raids: [], teams: {}, raidsAt: 0, routes: [], routesAt: 0, hunt: null, loot: [], lootAt: 0, reports: null, reportsAt: 0,
    daily: null, dailyAt: 0, timers: [], prevSt: {}, flashUntil: {}, detail: null, err: '', scrollTo: '', busy: {}, built: '' };
  const P = { party: pref('raids.party', ''), fit: pref('raids.fit', 'fits'), st: pref('raids.st', 'any'), region: pref('raids.region', ''), sort: pref('raids.sort', 'level'),
    rtF: pref('raids.rtF', 'all'), q: '', minL: '', maxL: '' };
  const $id = (i) => document.getElementById(i);
  const nowMs = () => Date.now();
  const st8 = () => (typeof STATE !== 'undefined' && STATE && STATE.chars) ? STATE.chars : [];
  const pcol = (p) => { try { return partyColor(p); } catch (e) { return '#3b82f6'; } };
  const liveObj = () => { try { return (typeof LIVE !== 'undefined' && LIVE && LIVE.running) ? LIVE : null; } catch (e) { return null; } };
  const areas = () => { try { return (typeof RAIDAREAS !== 'undefined' && RAIDAREAS) || {}; } catch (e) { return {}; } };
  const when = (iso) => { try { return hhmm(iso); } catch (e) { return String(iso || ''); } };
  const left = (ms) => {
    if (!(ms > 0)) return 'now';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
  };
  const shortZone = (z) => String(z || '').replace(/\s*\((?:Mobs|Lv\.?|lvl)[^)]*\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();

  // =========================================================================================== model
  function regionOf(r) {
    if (!isFinite(r.x)) return '';
    let best = '', bd = 1e12;
    Object.entries(TOWNS).forEach(([k, t]) => { const d = Math.hypot(t[0] - r.x, t[1] - r.y); if (d < bd) { bd = d; best = k; } });
    return best;
  }
  const dungeon = (r) => /dungeon|tower|floor|temple|crypt|catacomb|labyrinth|tomb|ant cave|cave of/i.test(String(r.zone || '').replace(/necropolis[^/]*/i, '')) || (r.z != null && r.z < -4500);
  const epic = (r) => r.type !== 'raid' || EPIC.test(String(r.name || ''));
  /** raidhunt's own rules (swarm.js raidHuntLoop): raid type, no epic, 9-man ok, reachable, no dungeon */
  const huntable = (r) => !epic(r) && r.party9 !== false && r.reachable !== false && !dungeon(r);
  function teamOf(p) { const t = RP.teams[p]; return t && isFinite(t.min) && isFinite(t.max) ? t : null; }
  /** fit for a party = raidhunt's rule: no curse (boss and minions >= its highest member - 8), boss <= its lowest member + 3 */
  function fitFor(r, t) {
    if (!t) return '';
    const curse = r.curseLevel != null ? r.curseLevel : r.level;
    if (curse < t.max - 8) return 'curse';
    if (r.level > t.min + 3) return 'hard';
    return r.level >= t.max - 3 ? 'good' : 'ok';
  }
  const FIT_TXT = { good: 'fits', ok: 'easy', hard: 'too hard', curse: 'curse' };
  function leaderPos(p) { const c = st8().find(x => x.name === p); return c && isFinite(c.x) && c.ageSec <= 300 ? c : null; }
  function distFrom(p, r) { const c = leaderPos(p); return c && isFinite(r.x) ? Math.hypot(c.x - r.x, c.y - r.y) : null; }
  /** status: alive / dead (respawn countdown) / window (maybe up) / up (should be up) / unknown */
  function stOf(r, now) {
    if (r.rstate === 'alive') return { k: 'alive', label: 'alive', sub: r.aliveAt ? 'seen ' + when(r.aliveAt) : '' };
    if (r.deathAt && r.earliest) {
      const e = Date.parse(r.earliest), l = Date.parse(r.latest), d = Date.parse(r.deathAt);
      const how = r.deathHow === 'killed' ? 'killed by us' : 'found dead';
      if (now < e) return { k: 'dead', label: 'dead', sub: `${how} ${when(r.deathAt)}`, pre: 'up in', to: e, from: d };
      if (now < l) return { k: 'window', label: 'maybe up', sub: `${how} ${when(r.deathAt)}`, pre: 'window ends in', to: l, from: e };
      return { k: 'up', label: 'should be up', sub: `window ended ${when(r.latest)}` };
    }
    return { k: 'unknown', label: 'unknown', sub: `respawn ${r.respawn || '?'} · never seen dead` };
  }
  const pct = (from, to, now) => (to > from ? Math.max(0, Math.min(100, Math.round(100 * (now - from) / (to - from)))) : 0);
  function routeById() { const m = {}; RP.routes.forEach(r => { m[String(r.id)] = r; }); return m; }
  function lootByBoss() { const m = {}; RP.loot.forEach(k => { if (!m[k.boss]) m[k.boss] = k; }); return m; }   // newest first
  function lootLine(k) {
    if (!k) return '';
    const all = []; Object.values(k.chars || {}).forEach(list => list.forEach(it => all.push(it)));
    all.sort((a, b) => (b.count || 0) - (a.count || 0));
    return all.slice(0, 3).map(it => `${it.name}${it.count > 1 ? ' ×' + Number(it.count).toLocaleString() : ''}`).join(', ') + (all.length > 3 ? ` +${all.length - 3}` : '');
  }
  function parties() {
    const ps = Object.keys(RP.teams).filter(p => (RP.teams[p].members || []).length);
    return ps.sort((a, b) => (RP.teams[b].members.length - RP.teams[a].members.length) || a.localeCompare(b));
  }
  function selParty() {
    const ps = parties();
    if (P.party && ps.includes(P.party)) return P.party;
    const h = RP.hunt; const on = (h && h.activeLeaders) || (h && h.active && !h.stale ? [h.leader] : []); const p0 = on.find(x => ps.includes(x)); if (p0) return p0;
    return ps[0] || '';
  }
  /** what raidhunt would take next for a party (lowest level first, then nearest) */
  function nextFor(p, n) {
    const t = teamOf(p); if (!t) return [];
    const now = nowMs();
    return RP.raids.filter(r => huntable(r) && /good|ok/.test(fitFor(r, t)) && stOf(r, now).k !== 'dead')
      .sort((a, b) => (a.level - b.level) || ((distFrom(p, a) || 0) - (distFrom(p, b) || 0))).slice(0, n || 3);
  }

  // =========================================================================================== routing / page
  function section() {
    let s = $id(SEC);
    if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win rp'; s.hidden = true;
    s.innerHTML = '<div id="rpView"></div>';
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('input', onInput);
    s.addEventListener('change', onInput);
    s.addEventListener('toggle', onToggle, true);                    // <details> open/close (toggle does not bubble: capture)
    return s;
  }
  function route(kind, arg) {
    if (kind === 'raids') { open('board'); return true; }
    if (kind === 'raid' && arg) { open('boss', decodeURIComponent(arg)); return true; }
    close();
    return false;
  }
  function open(mode, id) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'raidsv2'; } catch (e) { }                     // the old Raids loops (TAB === 'raids' / 'raid') stay quiet
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'raids')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false;
    const was = RP.mode + ':' + RP.bossId;
    RP.mode = mode; RP.bossId = mode === 'boss' ? String(id) : null;
    if (was !== RP.mode + ':' + RP.bossId) window.scrollTo(0, 0);
    RP.open = true;
    stopTimers();
    RP.timers = [setInterval(tick, 1000), setInterval(() => load(false), 3000)];
    if (mode === 'board') buildBoard(); else buildBoss(RP.bossId);
    load(true);
  }
  function stopTimers() { RP.timers.forEach(clearInterval); RP.timers = []; }
  function close() {
    if (!RP.open) return;
    RP.open = false; stopTimers();
    const s = $id(SEC); if (s) s.hidden = true;
  }
  document.addEventListener('visibilitychange', () => { if (RP.open && !document.hidden) load(true); });

  // =========================================================================================== data
  async function guard(key, fn) { if (RP.busy[key]) return; RP.busy[key] = true; try { await fn(); } catch (e) { RP.err = e.message; } finally { RP.busy[key] = false; } }
  function load(force) {
    if (!RP.open || document.hidden) return;
    const t = nowMs();
    if (force || t - RP.raidsAt > 30000) guard('raids', async () => { const d = await api('/api/raids'); RP.raids = d.raids || []; RP.teams = d.teams || {}; RP.raidsAt = nowMs(); try { RAIDS = RP.raids; RAIDTEAMS = RP.teams; } catch (e) { } render(); });
    if (force || t - RP.routesAt > 60000) guard('routes', async () => { const d = await api('/api/routes'); RP.routes = d.routes || []; RP.routesAt = nowMs(); render(); });
    guard('hunt', async () => { RP.hunt = await api('/api/raidhunt'); renderPin(); });
    if (force || t - RP.lootAt > 30000) guard('loot', async () => { const d = await api('/api/raidloot'); RP.loot = d.kills || []; RP.lootAt = nowMs(); render(); });
    if (secOpen('reports') || RP.mode === 'boss') { if (force || t - RP.reportsAt > 30000) guard('reports', async () => { RP.reports = await api('/api/raidreports'); RP.reportsAt = nowMs(); renderSecs(); renderBossReports(); }); }
    if (secOpen('daily') && (force || t - RP.dailyAt > 60000)) guard('daily', async () => { RP.daily = await api('/api/daily'); RP.dailyAt = nowMs(); try { DAILY = RP.daily; } catch (e) { } renderSecs(); });
    try { raidAreasRefresh(); } catch (e) { }
  }
  function render() { if (!RP.open) return; if (RP.mode === 'board') { renderPin(); renderBoard(); renderRoutes(); renderSecs(); } else renderBossStatus(); }
  const secOpen = (k) => { const el = document.querySelector(`#${SEC} details[data-sec="${k}"]`); return !!(el && el.open); };

  // =========================================================================================== board
  function buildBoard() {
    const v = $id('rpView'); if (!v || RP.built === 'board') { renderAll(); return; }
    RP.built = 'board';
    const so = (k, t) => `<option value="${k}"${P.sort === k ? ' selected' : ''}>${t}</option>`;
    const det = (k, title, extra) => `<details class="rp-sec" data-sec="${k}"${pref('raids.open.' + k, false) ? ' open' : ''}><summary><b>${title}</b><span class="muted" id="rpSum_${k}">${extra || ''}</span></summary><div class="rp-dbody" id="rpSec_${k}"></div></details>`;
    v.innerHTML = `<div class="rp-head"><h2>${GI(UI.raid)} Raid bosses</h2><span class="rp-sum" id="rpSum"></span>
        <div class="act"><select id="rpParty" title="the party the fit, the distances and the orders are for" aria-label="party"></select></div></div>
      <div class="rp-pin" id="rpPin"></div>
      <div class="rp-bar">
        <div class="row"><input type="search" id="rpQ" placeholder="find a boss, zone or minion…" aria-label="find a boss">
          <select id="rpRegion" aria-label="region"></select>
          <select id="rpSort" aria-label="sort">${so('level', 'sort: level')}${so('respawn', 'sort: respawn')}${so('dist', 'sort: distance')}${so('name', 'sort: name')}</select></div>
        <div class="row"><div class="rp-seg" id="rpFitSeg"></div><div class="rp-seg" id="rpStSeg"></div>
          <input type="number" id="rpMin" placeholder="min lvl" aria-label="minimum level"><input type="number" id="rpMax" placeholder="max lvl" aria-label="maximum level"></div>
      </div>
      <div class="rp-count" id="rpCount"></div>
      <div class="rp-board" id="rpBoard"></div>
      ${det('routes', 'Saved routes', '')}
      ${det('reports', 'Fight reports', '')}
      ${det('loot', 'Loot log', '')}
      ${det('daily', 'Daily dungeons', '')}`;
    renderAll();
  }
  function renderAll() { renderPin(); renderBoard(); renderRoutes(); renderSecs(); }
  function partyOptions(sel) {
    const p = selParty();
    const html = parties().map(x => { const t = RP.teams[x]; return `<option value="${esc(x)}"${x === p ? ' selected' : ''}>party ${esc(x)} (${t.members.length}, lvl ${t.min}-${t.max})</option>`; }).join('');
    if (sel && sel.dataset.opts !== html) { sel.innerHTML = html; sel.dataset.opts = html; }
    if (sel && p && sel.value !== p && document.activeElement !== sel) sel.value = p;
  }
  function filtered(now) {
    const p = selParty(), t = teamOf(p), q = P.q.trim().toLowerCase(), mn = +P.minL || 0, mx = +P.maxL || 999;
    return RP.raids.filter(r => {
      if (r.level < mn || r.level > mx) return false;
      if (q && !`${r.name} ${r.zone} ${(r.minions || []).join(' ')} ${r.tp || ''}`.toLowerCase().includes(q)) return false;
      if (P.region && regionOf(r) !== P.region) return false;
      if (P.fit === 'fits' && !/good|ok/.test(fitFor(r, t))) return false;
      const k = stOf(r, now).k;
      if (P.st === 'up' && !/alive|up|window/.test(k)) return false;
      if (P.st === 'soon' && !(k === 'window' || (k === 'dead' && Date.parse(r.earliest) - now < 3 * 3600e3))) return false;
      if (P.st === 'dead' && k !== 'dead') return false;
      return true;
    });
  }
  function sortList(list, now) {
    const p = selParty();
    const rk = (r) => { const s = stOf(r, now); return s.k === 'alive' ? 0 : s.k === 'up' ? 1 : s.k === 'window' ? 2e12 + s.to : s.k === 'dead' ? 4e12 + s.to : 9e12; };
    const cmp = { level: (a, b) => a.level - b.level || a.name.localeCompare(b.name), name: (a, b) => a.name.localeCompare(b.name),
      respawn: (a, b) => rk(a) - rk(b) || a.level - b.level, dist: (a, b) => ((distFrom(p, a) ?? 1e12) - (distFrom(p, b) ?? 1e12)) || a.level - b.level }[P.sort] || ((a, b) => a.level - b.level);
    return list.sort(cmp);
  }
  function renderBoard() {
    if (RP.mode !== 'board' || !$id('rpBoard')) return;
    const now = nowMs(), p = selParty(), t = teamOf(p);
    partyOptions($id('rpParty'));
    // segment buttons with counts
    const base = RP.raids.length;
    const fitsN = RP.raids.filter(r => /good|ok/.test(fitFor(r, t))).length;
    patch($id('rpFitSeg'), [['fits', `fits ${esc(p || 'party')}`, fitsN], ['any', 'all levels', base]].map(([k, l, n]) => `<button type="button" data-rpfit="${k}" class="${P.fit === k ? 'on' : ''}">${l}<span class="n">${n}</span></button>`).join(''));
    const cnt = { up: 0, soon: 0, dead: 0 }; RP.raids.forEach(r => { const k = stOf(r, now).k; if (/alive|up|window/.test(k)) cnt.up++; if (k === 'window' || (k === 'dead' && Date.parse(r.earliest) - now < 3 * 3600e3)) cnt.soon++; if (k === 'dead') cnt.dead++; });
    patch($id('rpStSeg'), [['any', 'any status', base], ['up', 'up now', cnt.up], ['soon', 'respawn < 3 h', cnt.soon], ['dead', 'dead', cnt.dead]].map(([k, l, n]) => `<button type="button" data-rpst="${k}" class="${P.st === k ? 'on' : ''}">${l}<span class="n">${n}</span></button>`).join(''));
    const regs = {}; RP.raids.forEach(r => { const g = regionOf(r); if (g) regs[g] = (regs[g] || 0) + 1; });
    const rs = $id('rpRegion'), rhtml = `<option value="">every region</option>` + Object.keys(regs).sort().map(g => `<option value="${g}"${P.region === g ? ' selected' : ''}>near ${g} (${regs[g]})</option>`).join('');
    if (rs && rs.dataset.opts !== rhtml) { rs.innerHTML = rhtml; rs.dataset.opts = rhtml; rs.value = P.region; }
    const list = sortList(filtered(now), now);
    const routes = routeById(), loot = lootByBoss(), L = liveObj(), nx = nextFor(p, 1)[0];
    const alive = RP.raids.filter(r => stOf(r, now).k === 'alive').length;
    patch($id('rpSum'), RP.raids.length ? `<b>${RP.raids.length}</b> bosses · <b>${alive}</b> seen alive · <b>${RP.routes.length}</b> saved routes` : 'loading…');
    patch($id('rpCount'), `${list.length} of ${RP.raids.length} bosses${list.length < RP.raids.length ? ` · <a data-rpall="1">show all</a>` : ''}${t ? ` · fit and distances for party <b style="color:${pcol(p)}">${esc(p)}</b> (lvl ${t.min}-${t.max})` : ''}`);
    const cards = list.map((r, i) => card(r, i, now, p, routes, loot, L, nx));
    patch($id('rpBoard'), cards.join('') || `<div class="rp-empty">No boss matches these filters. <a data-rpall="1">Show all ${RP.raids.length}</a></div>`);
    tick();
  }
  function card(r, i, now, p, routes, loot, L, nx) {
    const s = stOf(r, now), rt = routes[String(r.id)], area = areas()[String(r.id)], lk = loot[r.name];
    // a status change since the last render flashes the card once (1.6 s)
    const prev = RP.prevSt[r.id]; RP.prevSt[r.id] = s.k;
    if (prev && prev !== s.k) RP.flashUntil[r.id] = now + 1700;
    const flash = (RP.flashUntil[r.id] || 0) > now;
    const live = L && L.boss && L.boss.name === r.name;
    const badges = [];
    if (live) badges.push('<span class="rp-b route bad" title="this boss is being fought right now">LIVE</span>');
    if (area) badges.push(`<span class="rp-b area" title="fight area set on the dashboard${area.enabled === false ? ' (switched off)' : ''}">area</span>`);
    if (rt) badges.push(`<span class="rp-b route ${rt.manual ? 'locked' : ''}${rt.fails ? ' bad' : ''}" title="${rt.manual ? 'locked route: the bots walk exactly this' : 'learned route: recorded by a party after a successful trip'}${rt.fails ? ' · failed ' + rt.fails + 'x' : ''}">route${rt.manual ? ' ✓' : ''}${rt.fails ? ' !' : ''}</span>`);
    if (epic(r)) badges.push(`<span class="rp-b epic">${esc(r.type === 'raid' ? 'epic' : r.type)}</span>`);
    else if (!huntable(r)) badges.push(`<span class="rp-b skip" title="raidhunt skips it (${r.reachable === false ? 'no walkable way' : dungeon(r) ? 'inside a dungeon' : 'not for 9'}); a manual raid order still works">no hunt</span>`);
    const reg = regionOf(r), mins = (r.minions || []).length;
    const safe = (r.curseLevel != null ? r.curseLevel : r.level) + 8;
    const sub = `${esc(shortZone(r.zone))}${reg ? ' · near ' + reg : ''}${mins ? ` · ${mins} minion${mins > 1 ? 's' : ''}` : ''} · safe ≤ ${safe}`;
    const stat = `<div class="rp-stat"><span class="k">${esc(s.label)}</span><span class="v">${s.to ? `${esc(s.pre)} <span class="cd" data-cdto="${s.to}"></span> · ` : ''}<span class="muted">${esc(s.sub)}</span></span>${s.to ? `<div class="rp-bar2" title="respawn ${esc(r.respawn || '')}${r.measuredH ? ' · measured ' + (r.measuredExact ? '' : '≤ ') + r.measuredH + ' h' : ''}"><i data-bfrom="${s.from}" data-bto="${s.to}" style="width:${pct(s.from, s.to, now)}%"></i></div>` : ''}</div>`;
    // parties: every party it fits + the selected one (its fit even when hard / curse), with the distance from that party's leader
    const chips = parties().map(x => { const f = fitFor(r, teamOf(x)); if (!(x === p || /good|ok/.test(f))) return ''; const d = distFrom(x, r);
      return `<span class="rp-pf ${f}${x === p ? ' sel' : ''}" style="--pc:${pcol(x)}" title="party ${esc(x)}: ${FIT_TXT[f] || '?'}${d != null ? ', ' + km(d) + ' from its leader' : ''}">${esc(x)} · ${FIT_TXT[f] || '?'}${d != null ? ` <span class="d">${km(d)}</span>` : ''}</span>`; }).join('');
    const last = r.deathHow === 'killed' && r.deathAt ? `<div class="rp-last"><b>✓ killed ${when(r.deathAt)}</b>${lk ? ' · ' + esc(lootLine(lk)) : ''}</div>`
      : lk ? `<div class="rp-last">last loot ${when(lk.at)} · ${esc(lootLine(lk))}</div>` : '';
    return `<article class="rp-card${nx && nx.id === r.id ? ' next' : ''}${live ? ' livefight' : ''}${flash ? ' flash' : ''}" data-st="${s.k}" data-rpid="${r.id}" style="--i:${Math.min(i, 16)}">
      <div class="rp-ic"><img src="/icons/${UI.raid}.png" alt="" loading="lazy"><i class="ring"></i><b class="lv">${r.level}</b></div>
      <div class="rp-main"><div class="rp-t"><a class="rp-name" href="#/raid/${r.id}">${esc(r.name)}</a>${nx && nx.id === r.id ? '<span class="rp-b route locked" title="what raidhunt takes next for this party">next</span>' : ''}${badges.join('')}</div>
        <div class="rp-sub" title="${esc(r.tp || '')}${r.walk ? ' + ' + km(r.walk) + ' walk' : ''}">${sub}</div>${stat}
        ${chips ? `<div class="rp-fit">${chips}</div>` : ''}${last}</div>
      <div class="rp-go"><button type="button" data-rpraid="${esc(r.name)}" title="send party ${esc(p)} to raid it">Raid</button></div></article>`;
  }

  // ------------------------------------------------------------------------- pinned: live raid + raidhunt per party
  function renderPin() {
    const el = RP.mode === 'board' ? $id('rpPin') : null; if (!el) return;
    const L = liveObj(), out = [];
    if (L) {
      const b = L.boss || {}, party = L.party || [], up = party.filter(x => !x.dead).length;
      const secs = L.startedMs ? Math.max(1, Math.round((Date.parse(L.updatedAt) - L.startedMs) / 1000)) : 0;
      const hp = b.hp != null ? Math.round(b.hp) : null;
      out.push(`<a class="rp-live" href="#/live"><span class="dot"></span><div class="t"><b>LIVE · ${esc(b.name || L.bossName || '?')}</b>
        <div class="m">${L.leader ? 'party ' + esc(L.leader) + ' · ' : ''}${up}/${party.length} alive${secs ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : ''}${L.phase ? ' · ' + esc(L.phase) : ''}</div>
        ${gauge('hp', hp || 0, hp != null ? 'boss ' + hp + '%' : 'boss HP ?')}</div>
        <div class="b"><button type="button" data-rpgo="#/live">Watch</button>${L.leader ? `<button type="button" data-rpgo="#/live/${encodeURIComponent(L.leader)}">Party view</button>` : ''}</div></a>`);
    }
    const H = RP.hunt || {};
    // 2026-10-10: one hunt per party (H.hunts[leader]); older servers sent only the newest one at the top level
    const huntOf = (p) => { const x = (H.hunts || {})[p] || (H.leader === p ? H : null); return x && x.active && !x.stale ? x : null; };
    const hunting = parties().filter(p => huntOf(p));
    const rows = parties().map(p => {
      const t = teamOf(p); if (!t) return '';
      const h = huntOf(p);
      if (h) {
        const c = h.current || {}, ph = huntPhase(h), pi = HUNT_PHASES.indexOf(ph);
        const steps = HUNT_PHASES.map((x, i) => `<span class="${i < pi ? 'past' : i === pi ? 'cur' : ''}">${x}</span>`).join('');
        const q = (h.queue || []).slice(0, 4).map(x => `<a href="#/raid/${x.id}">${esc(x.name)}</a> <span class="muted">${x.level}</span>`).join(' · ');
        const done = (h.history || []).slice(-4).reverse().map(x => `<a href="#/raid/${x.id}">${esc(x.name)}</a> ${huntBadge(x.outcome)}`).join(' ');
        return `<div class="rp-hrow on" style="--pc:${pcol(p)}"><div class="p">${esc(p)} <span class="lv">lvl ${t.min}-${t.max}</span> <span class="fit next">raidhunt</span> ${c.id ? `<a href="#/raid/${c.id}">${esc(c.name || '?')}</a>` : esc(c.name || '…')} <span class="muted">${c.level ? 'lvl ' + c.level : ''}${c.since ? ' · ' + huntAgo(c.since) : ''}</span></div>
          <button type="button" data-rphunt="stop" data-party="${esc(p)}">Stop</button>
          <div class="rp-steps">${steps}</div>${h.step ? `<div class="raw">${esc(h.step)}</div>` : ''}
          <div class="q">${q ? `<span class="ql">Next:</span> ${q}` : ''}${done ? `${q ? '<br>' : ''}<span class="ql">Done:</span> ${done}` : ''}</div></div>`;
      }
      const nx = nextFor(p, 3).map(x => `<a href="#/raid/${x.id}">${esc(x.name)}</a> <span class="muted">${x.level}</span>`).join(' · ');
      return `<div class="rp-hrow" style="--pc:${pcol(p)}"><div class="p">${esc(p)} <span class="lv">lvl ${t.min}-${t.max} · ${t.members.length} chars</span></div>
        <button type="button" data-rphunt="start" data-party="${esc(p)}" title="the party takes the bosses that fit, one after the other">Raidhunt</button>
        <div class="q"><span class="ql">Next if it hunts:</span> ${nx || '<span class="muted">no boss up that fits</span>'}</div></div>`;
    }).join('');
    const sumTxt = hunting.length ? hunting.map(p => `party ${esc(p)} hunts ${esc((huntOf(p).current || {}).name || '…')}`).join(' · ') : 'nobody hunts right now';
    out.push(`<details class="rp-hunts"${pref('raids.open.hunts', true) ? ' open' : ''} data-sec="hunts"><summary><b>Raidhunt</b><span class="muted">${sumTxt} · per party: the next bosses</span></summary>${rows || '<div class="rp-hrow"><span class="muted">no party is reporting</span></div>'}</details>`);
    patch(el, out.join(''));
  }

  // ------------------------------------------------------------------------- saved routes (collapsed by default, remembered)
  function routeShape(r) {
    const s = r.shape || []; if (s.length < 2) return '<svg viewBox="0 0 70 52"></svg>';
    const xs = s.map(q => q[0]), ys = s.map(q => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), k = Math.min(60 / w, 42 / h), ox = (70 - w * k) / 2, oy = (52 - h * k) / 2;
    const pt = (q) => `${(ox + (q[0] - x0) * k).toFixed(1)},${(oy + (q[1] - y0) * k).toFixed(1)}`;
    const a = pt(s[0]).split(','), e = pt(s[s.length - 1]).split(',');
    return `<svg viewBox="0 0 70 52" aria-hidden="true"><polyline points="${s.map(pt).join(' ')}"/><circle class="s" cx="${a[0]}" cy="${a[1]}" r="2.6"/><circle class="e" cx="${e[0]}" cy="${e[1]}" r="3.2"/></svg>`;
  }
  function renderRoutes() {
    const el = RP.mode === 'board' ? $id('rpSec_routes') : null; if (!el) return;
    const rs = RP.routes.slice(), locked = rs.filter(r => r.manual).length, failing = rs.filter(r => r.fails).length;
    patch($id('rpSum_routes'), `${rs.length} bosses · ${locked} locked · ${rs.length - locked} learned${failing ? ` · <span class="st-dead">${failing} failed lately</span>` : ''}`);
    if (!secOpen('routes')) return;                                  // collapsed: no cards built at all
    const kind = (r) => r.fails ? 'failing' : r.manual ? 'locked' : 'learned';
    const list = rs.filter(r => P.rtF === 'all' || kind(r) === P.rtF || (P.rtF === 'locked' && r.manual));
    const seg = [['all', 'all', rs.length], ['locked', 'locked', locked], ['learned', 'learned', rs.length - locked], ['failing', 'failed', failing]]
      .map(([k, l, n]) => `<button type="button" data-rprtf="${k}" class="${P.rtF === k ? 'on' : ''}">${l}<span class="n">${n}</span></button>`).join('');
    // grouped per boss (one file per boss), boss level order, a heading per region
    const groups = {}; list.forEach(r => { const b = RP.raids.find(x => String(x.id) === String(r.id)) || { x: r.boss_xy ? r.boss_xy[0] : NaN, y: r.boss_xy ? r.boss_xy[1] : NaN }; const g = regionOf(b) || 'elsewhere'; (groups[g] = groups[g] || []).push(r); });
    let i = 0;
    const cards = Object.keys(groups).sort().map(g => `<div class="rp-rgroup">near ${esc(g)} <span class="muted">(${groups[g].length})</span></div>` + groups[g].sort((a, b) => (a.level || 0) - (b.level || 0)).map(r => {
      const st = r.start ? (r.start.kind === 'town' ? `.${String(r.start.town || '').toLowerCase()} (walk from the town)` : `${r.start.desc} (gatekeeper)`) : `${r.landing || '?'} (after the automatic teleport)`;
      const origin = r.by ? `recorded by party <b style="color:${pcol(r.by)}">${esc(r.by)}</b> ${when(r.savedAt)}` + (r.editedAt ? ` · corrected on the dashboard ${when(r.editedAt)}` : '')
        : r.editedAt ? `drawn / corrected on the dashboard ${when(r.editedAt)}` : `recorded by a party after a successful trip ${when(r.savedAt)}`;
      const use = `used <b>${r.uses || 0}×</b>${r.lastOk ? ` · last OK ${when(r.lastOk)}${r.lastBy ? ' (' + esc(r.lastBy) + ')' : ''}` : ''}${r.fails ? ` · <span class="st-dead">failed ${r.fails}×${r.lastFail ? ' ' + when(r.lastFail) + (r.lastFailBy ? ' (' + esc(r.lastFailBy) + ')' : '') : ''}</span>` : ''}${r.autoFixed ? ` · auto-fixed ${r.autoFixed}×` : ''}`;
      return `<div class="rp-rt ${kind(r)}" style="--i:${Math.min(i++, 20)}">${routeShape(r)}<div style="min-width:0"><div class="h"><a href="#/raid/${r.id}">${esc(r.boss)}</a> <span class="muted">lvl ${r.level || '?'}</span>
          ${r.manual ? '<span class="rp-b route locked" title="the bots walk exactly this route and never replace it">locked</span>' : '<span class="rp-b route" title="a better recorded walk may replace it; dropped after 2 failures">learned</span>'}</div>
        <div class="l">From <b>${esc(st)}</b> · ${r.points} points · ${km(r.length || 0)} walk</div><div class="l">${origin}</div><div class="l">${use}</div></div>
        <div class="acts"><button type="button" data-rprmap="${r.id}" title="open the boss page with this route on the map (editor)">Map</button>
          <button type="button" data-rprlock="${r.id}|${r.manual ? 'unlock' : 'lock'}">${r.manual ? 'Unlock' : 'Lock'}</button>
          <button type="button" data-rprdel="${r.id}|${esc(r.boss)}">Delete</button></div></div>`;
    }).join('')).join('');
    patch(el, `<div class="rp-explain">These are <b>learned routes</b>, not characters wandering off: when a party reaches a raid boss, its leader saves the walk from the teleport landing to the boss here, and every party reuses it next time (one route per boss). Routes drawn or corrected on the dashboard are <b>locked</b> — the bots walk exactly those.</div>
      <div class="rp-bar"><div class="row"><div class="rp-seg">${seg}</div></div></div>
      <div class="rp-routes">${cards || '<div class="rp-empty">No route in this group.</div>'}</div>`);
  }
  // ------------------------------------------------------------------------- reports / loot / daily (the old renderers, inside the new sections)
  function renderSecs() {
    if (RP.mode !== 'board') return;
    const k = RP.loot;
    patch($id('rpSum_loot'), k.length ? `${k.length} kills with loot · last ${esc(k[0].boss)} ${when(k[0].at)}` : '');
    if (secOpen('loot')) patch($id('rpSec_loot'), lootHtml(k.slice(0, 20), true));
    const R = RP.reports;
    if (R) { const r0 = (R.reports || [])[0]; patch($id('rpSum_reports'), `${(R.reports || []).length} fights${r0 ? ` · last ${esc(r0.boss)} ${esc(r0.outcome || '')} ${r0.start ? when(r0.start) : ''}` : ''}`); }
    if (secOpen('reports')) patch($id('rpSec_reports'), R ? rrHtml(R) : '<div class="muted">loading…</div>');
    if (RP.daily) { const on = Object.entries(RP.daily.enabled || {}).filter(([, v]) => Object.values(v || {}).some(Boolean)).map(([l]) => l); patch($id('rpSum_daily'), on.length ? `on for ${on.map(esc).join(', ')}` : 'off for every party'); }
    if (secOpen('daily')) patch($id('rpSec_daily'), RP.daily ? dailyHtml(RP.daily) : '<div class="muted">loading…</div>');
  }

  // =========================================================================================== boss page
  async function buildBoss(id) {
    const v = $id('rpView'); if (!v) return;
    RP.built = 'boss:' + id;
    const p = selParty();
    v.innerHTML = '<div class="muted" style="padding:10px">Loading…</div>';
    let d; try { d = await api('/api/raid/' + encodeURIComponent(id) + '?party=' + encodeURIComponent(p)); } catch (e) { v.textContent = e.message; return; }
    if (RP.built !== 'boss:' + id || RP.mode !== 'boss') return;
    if (!d || !d.boss) { v.innerHTML = `<div class="rp-empty">Unknown boss ${esc(id)}. <a href="#/raids">Back to the raid bosses</a></div>`; return; }
    RP.detail = d;
    const b = d.boss, tp = b.nearestTeleport || {};
    const useCls = (u) => /^use now/.test(u) ? 'use-now' : /^soon|upgrade/.test(u) ? 'use-soon' : /Crafter1|craft/i.test(u) ? 'use-craft' : 'muted';
    const groups = (d.categories || []).map((c, gi) => `<div class="rpb-dg"><div class="gh"><span>${c.kind === 'spoil' ? 'Spoil' : 'Drop'} group ${gi + 1}</span><span class="muted">${c.chance != null ? `group drops ${c.chance}% (×1.5 ≈ ${Math.min(100, Math.round(c.chance * 150) / 100)}%), then ONE item` : 'each item rolls on its own'}</span></div>` +
      c.items.map(it => `<div class="rpb-it"><img loading="lazy" src="${itemIcon(it.id)}" alt=""><span class="n" title="${esc(it.name)}">${esc(it.name)}${it.grade && !/^(NONE|0)$/.test(it.grade) ? ` <span class="muted">${esc(it.grade)}</span>` : ''}</span>
        <span class="c">${it.min === it.max ? it.min : it.min + '–' + it.max} · ${it.overall}% · <b>${it.effective}%</b></span><span class="u ${useCls(it.useful)}">${esc(it.useful)}</span><span class="rpb-chance"><i style="--w:${Math.max(2, Math.min(100, it.effective))}%"></i></span></div>`).join('') + '</div>').join('');
    v.innerHTML = `<div class="rpb-head" id="rpbHead"></div>
      <div class="rpb-grid">
        <div class="box rpb-wide rpb-live" id="rpbLiveBox" hidden><h3>${GI(UI.sword, 'sm')}<span>LIVE fight</span></h3><div id="rpbLive"></div></div>
        <div class="box"><h3>${GI(UI.target, 'sm')}<span>Status &amp; respawn</span></h3><div id="rpbStatus"></div><div style="margin-top:8px" id="rpbHist"></div></div>
        <div class="box"><h3>${GI(UI.char, 'sm')}<span>Facts &amp; parties</span></h3><div id="rpbFacts"></div></div>
        <div class="box"><h3>${GI(UI.inv, 'sm')}<span>Drops</span><span class="muted" style="margin-left:auto">chance · ×1.5 (L2Toggle)</span></h3><div class="rpb-drops">${groups || '<div class="muted">no drop list in the datapack</div>'}</div></div>
        <div class="box"><h3>${GI(UI.star, 'sm')}<span>What we got from it</span></h3><div id="rpbLoot" class="muted">…</div></div>
        <div class="box"><h3>${GI(UI.quest, 'sm')}<span>Fight reports</span></h3><div id="rpbReports" class="muted">…</div></div>
        <div class="box"><h3>${GI(UI.map, 'sm')}<span>Fight area</span><button type="button" id="rpArea" style="margin-left:auto" title="where the team fights this boss, what it clears first and where it waits (shape editor)">✎ Edit</button></h3><div id="rpAreaInfo" class="muted">…</div></div>
        <div class="box rpb-wide" id="rpbRouteBox"><h3>${GI(UI.map, 'sm')}<span>Route to this boss</span><span class="muted" style="margin-left:auto">${esc(tp.desc || '?')}${tp.walkDist ? ' + ' + km(tp.walkDist) + ' walk' : ''}</span></h3><div id="routeEd" class="muted">…</div></div>
      </div>`;
    renderBossStatus();
    api('/api/raidloot?boss=' + encodeURIComponent(b.name)).then(r => { const el = $id('rpbLoot'); if (el) el.innerHTML = lootHtml(r.kills, false); }).catch(() => { });
    try { routeEditor(b).then(() => { if (RP.scrollTo === 'route') { RP.scrollTo = ''; const el = $id('rpbRouteBox'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }).catch(e => { const el = $id('routeEd'); if (el) el.textContent = e.message; }); } catch (e) { }
    try { raidAreaInfo(b); } catch (e) { }
    renderBossReports();
  }
  function renderBossStatus() {
    if (RP.mode !== 'boss' || !RP.detail) return;
    const d = RP.detail, b = d.boss, now = nowMs(), p = selParty();
    const r = RP.raids.find(x => String(x.id) === String(b.id)) || Object.assign({}, d.status || {}, { id: b.id, name: b.name, level: b.level, x: b.x, y: b.y, z: b.z, zone: b.zoneName, curseLevel: b.curseLevel, minions: b.minions, type: b.type, respawn: `${b.respawnMinH}-${b.respawnMaxH}h` });
    const s = stOf(r, now), L = liveObj(), live = L && L.boss && L.boss.name === b.name;
    const ps = parties();
    const head = `<div class="rpb-top"><button type="button" id="rpbBack" class="cp-back" title="back" aria-label="back">◀</button>
        <div class="rp-ic" style="--st:var(--rp-${s.k === 'unknown' ? 'unk' : s.k === 'window' ? 'win' : s.k})"><img src="/icons/${UI.raid}.png" alt=""><i class="ring"></i><b class="lv">${b.level}</b></div>
        <div class="rpb-id"><h2>${esc(b.name)} ${live ? '<span class="rp-b route bad">LIVE</span>' : ''}${epic(r) ? '<span class="rp-b epic">epic</span>' : ''}</h2><div class="sub">${esc(shortZone(b.zoneName))} · near ${esc(regionOf(r) || '?')} · ${Number(b.hp || 0).toLocaleString()} HP · respawn ${b.respawnMinH}–${b.respawnMaxH} h</div></div>
        <div class="rpb-acts"><select id="rpbParty" aria-label="party">${ps.map(x => `<option value="${esc(x)}"${x === p ? ' selected' : ''}>party ${esc(x)}</option>`).join('')}</select>
          <button type="button" id="rpbRaid">Raid it</button>${live ? '<button type="button" data-rpgo="#/live">Watch live</button>' : ''}<button type="button" data-rpgo="#/raids">All bosses</button></div></div>
      <div class="rpb-stat" style="--st:var(--rp-${s.k === 'unknown' ? 'unk' : s.k === 'window' ? 'win' : s.k})"><span class="k">${esc(s.label)}</span><span>${s.to ? `${esc(s.pre)} <span class="cd" data-cdto="${s.to}"></span> · ` : ''}<span class="muted">${esc(s.sub)}</span></span>
        ${s.to ? `<div class="rp-bar2"><i data-bfrom="${s.from}" data-bto="${s.to}" style="width:${pct(s.from, s.to, now)}%"></i></div>` : ''}</div>`;
    patch($id('rpbHead'), head);
    const tp = b.nearestTeleport || {};
    const statusHtml = `<div class="rpb-kv"><span>Status</span><span>${esc(s.label)} — ${esc(s.sub)}</span>
      ${r.earliest ? `<span>Window</span><span>earliest ${when(r.earliest)} – latest ${when(r.latest)}</span>` : ''}
      <span>Datapack</span><span>${b.respawnMinH}–${b.respawnMaxH} h${r.measuredH ? ` · measured ${r.measuredExact ? '' : '≤ '}${r.measuredH} h` : ''}</span>
      ${r.aliveAt ? `<span>Seen alive</span><span>${when(r.aliveAt)}</span>` : ''}</div>`;
    patch($id('rpbStatus'), statusHtml);
    try { const st = d.status || {}; patch($id('rpbHist'), bossHistHtml({ seenLog: st.seenLog || [], respawnLog: st.respawnLog || [] })); } catch (e) { }   // rows only (the status itself is above)
    const fits = ps.map(x => { const t = teamOf(x), f = fitFor(r, t), dd = distFrom(x, r); return `<span class="rp-pf ${f}${x === p ? ' sel' : ''}" style="--pc:${pcol(x)}">${esc(x)} <span class="d">${t ? t.min + '-' + t.max : ''}</span> · ${FIT_TXT[f] || '?'}${dd != null ? ` <span class="d">${km(dd)}</span>` : ''}</span>`; }).join('');
    const safe = (r.curseLevel != null ? r.curseLevel : b.level) + 8;
    patch($id('rpbFacts'), `<div class="rpb-kv"><span>Curse</span><span>a member above level <b>${safe}</b> gets the raid curse (boss ${b.level}${b.minionLevelMin ? `, minions from ${b.minionLevelMin}` : ''})</span>
      <span>Parties</span><span><div class="rp-fit">${fits || '<span class="muted">no party reporting</span>'}</div></span>
      <span>Minions</span><span>${esc((b.minions || []).join(', ') || 'none')}</span>
      <span>Way there</span><span>${esc(tp.desc || '?')}${tp.walkDist ? ' + ' + km(tp.walkDist) + ' walk' : ''}${b.routeMaxMobLevel ? ` · monsters up to lvl ${b.routeMaxMobLevel} on the way` : ''}</span>
      <span>Raidhunt</span><span>${huntable(r) ? 'takes it when it fits' : `skips it (${epic(r) ? 'epic' : r.reachable === false ? 'no walkable way' : dungeon(r) ? 'inside a dungeon' : 'not for 9'}) — a manual raid order still works`}</span>
      <span>Spawn</span><span><code>${b.x}, ${b.y}, ${b.z}</code></span>
      <span>Raid points</span><span>${b.raidPoints || 0}</span>
      ${b.dangerNotes ? `<span>Danger</span><span>${esc(b.dangerNotes)}</span>` : ''}</div>`);
    const lb = $id('rpbLiveBox');
    if (lb) { lb.hidden = !live; if (live) { try { patch($id('rpbLive'), liveHtml()); } catch (e) { } } }
    tick();
  }
  function renderBossReports() {
    if (RP.mode !== 'boss' || !RP.detail) return;
    const el = $id('rpbReports'); if (!el) return;
    if (!RP.reports) { el.innerHTML = '<div class="muted">loading…</div>'; return; }
    const mine = (RP.reports.reports || []).filter(r => r.boss === RP.detail.boss.name);
    patch(el, mine.length ? mine.map(rrCard).join('') : '<div class="muted">No fight report for this boss yet (they appear after the next fight).</div>');
  }

  // =========================================================================================== live tick (countdowns, bars, live box)
  function tick() {
    if (!RP.open) return;
    const s = $id(SEC); if (!s || s.hidden) { close(); return; }        // another page took the screen (character page, live view, editor)
    const now = nowMs();
    s.querySelectorAll('[data-cdto]').forEach(e => { const t = left(+e.dataset.cdto - now); if (e.textContent !== t) e.textContent = t; });
    s.querySelectorAll('[data-bto]').forEach(e => { e.style.width = pct(+e.dataset.bfrom, +e.dataset.bto, now) + '%'; });
    if (RP.mode === 'board' && $id('rpPin')) renderPin();             // LIVE strip follows index.html's 1 s poll
    if (RP.mode === 'boss') { const L = liveObj(), lb = $id('rpbLiveBox'), live = L && RP.detail && L.boss && L.boss.name === RP.detail.boss.name; if (lb && lb.hidden === !!live) renderBossStatus(); else if (live) { try { patch($id('rpbLive'), liveHtml()); } catch (e) { } } }
  }

  // =========================================================================================== events
  async function order(party, cmd, label) { if (!party) { uiAlert({ title: 'No party', body: 'No party is reporting' }); return; } if (await confirmOrder('party:' + party, cmd, label)) send('party:' + party, null, cmd); }
  async function routeAction(id, action, label) {
    try {
      const d = await api('/api/route', { method: 'POST', body: JSON.stringify({ id, action }) });
      if (d && d.error) { uiError(d.error); return; }
      try { $id('msg').innerHTML = GI(UI.yes, 'sm') + ' ' + esc(label); } catch (e) { }
      RP.routesAt = 0; load(true);
    } catch (e) { uiError(e.message); }
  }
  function onClick(e) {
    const t = e.target;
    const g = t.closest('[data-rpgo]'); if (g) { e.preventDefault(); e.stopPropagation(); go(g.dataset.rpgo); return; }
    const raid = t.closest('[data-rpraid]'); if (raid) { e.stopPropagation(); order(selParty(), '!mission raid ' + raid.dataset.rpraid, 'Raid ' + raid.dataset.rpraid); return; }
    const h = t.closest('[data-rphunt]'); if (h) { e.preventDefault(); e.stopPropagation(); const stop = h.dataset.rphunt === 'stop'; order(h.dataset.party, stop ? '!raidhunt stop' : '!raidhunt', stop ? 'Stop raidhunt' : 'Raidhunt: take the bosses that fit, one after the other, until it gets too hard'); return; }
    const f = t.closest('[data-rpfit]'); if (f) { P.fit = f.dataset.rpfit; setPref('raids.fit', P.fit); renderBoard(); return; }
    const st = t.closest('[data-rpst]'); if (st) { P.st = st.dataset.rpst; setPref('raids.st', P.st); renderBoard(); return; }
    const rf = t.closest('[data-rprtf]'); if (rf) { P.rtF = rf.dataset.rprtf; setPref('raids.rtF', P.rtF); renderRoutes(); return; }
    if (t.closest('[data-rpall]')) { P.fit = 'any'; P.st = 'any'; P.region = ''; P.q = ''; P.minL = ''; P.maxL = ''; ['rpQ', 'rpMin', 'rpMax'].forEach(i => { const x = $id(i); if (x) x.value = ''; }); setPref('raids.fit', 'any'); setPref('raids.st', 'any'); setPref('raids.region', ''); renderBoard(); return; }
    const rm = t.closest('[data-rprmap]'); if (rm) { RP.scrollTo = 'route'; go('#/raid/' + rm.dataset.rprmap); return; }
    const rl = t.closest('[data-rprlock]'); if (rl) { const [id, a] = rl.dataset.rprlock.split('|'); routeAction(id, a, a === 'lock' ? 'route locked — the bots walk exactly this' : 'route unlocked — a better recorded walk may replace it'); return; }
    const rd = t.closest('[data-rprdel]'); if (rd) { const [id, name] = rd.dataset.rprdel.split('|'); uiConfirm({ title: `Delete the saved route to ${name}?`, body: ['The bots record a new walk next time they reach it.', uiNote('The old version is kept in routes/raid/history.')], confirmText: 'Delete route', danger: true }).then(ok => { if (ok) routeAction(id, 'delete', `route to ${name} deleted`); }); return; }
    if (t.closest('#rpbBack')) { if (typeof navDepth !== 'undefined' && navDepth > 0) history.back(); else go('#/raids'); return; }
    if (t.closest('#rpbRaid') && RP.detail) { order(selParty(), '!mission raid ' + RP.detail.boss.name, 'Raid ' + RP.detail.boss.name); return; }
    if (t.closest('[data-daily]')) { setTimeout(() => { RP.dailyAt = 0; load(false); }, 1500); return; }   // the old daily switch handler (document) saves it; re-read after
    const c = t.closest('.rp-card'); if (c && !t.closest('a, button, input, select')) { go('#/raid/' + c.dataset.rpid); return; }
  }
  let qT = 0;
  function onInput(e) {
    const t = e.target;
    if (t.id === 'rpQ') { P.q = t.value; clearTimeout(qT); qT = setTimeout(renderBoard, 120); return; }
    if (t.id === 'rpMin' || t.id === 'rpMax') { P[t.id === 'rpMin' ? 'minL' : 'maxL'] = t.value; clearTimeout(qT); qT = setTimeout(renderBoard, 150); return; }
    if (e.type !== 'change') return;
    if (t.id === 'rpRegion') { P.region = t.value; setPref('raids.region', P.region); renderBoard(); return; }
    if (t.id === 'rpSort') { P.sort = t.value; setPref('raids.sort', P.sort); renderBoard(); return; }
    if (t.id === 'rpParty' || t.id === 'rpbParty') {
      P.party = t.value; setPref('raids.party', P.party);
      try { const s = $id('rbParty'); if (s && [...s.options].some(o => o.value === P.party)) s.value = P.party; } catch (er) { }   // the old pages' party choice too
      if (RP.mode === 'board') { renderBoard(); renderPin(); } else { RP.built = ''; buildBoss(RP.bossId); }
    }
  }
  function onToggle(e) {
    const d = e.target; if (!d || d.tagName !== 'DETAILS' || !d.dataset.sec) return;
    setPref('raids.open.' + d.dataset.sec, d.open);
    if (!d.open || d.dataset.sec === 'hunts') return;
    if (d.dataset.sec === 'routes') renderRoutes(); else { if (d.dataset.sec === 'reports') RP.reportsAt = 0; if (d.dataset.sec === 'daily') RP.dailyAt = 0; load(false); renderSecs(); }
  }

  window.RaidsPage = { route, open, close, _rp: RP, _p: P, version: '2026-10-09', fitFor, stOf, nextFor };
})();
