// LIVE PARTY VIEW (user 2026-10-09 09:15: "click 'live' map on any party and see what each party member is doing: if they have aggro etc,
// what they are casting or fighting, if they are stuck, trying to work their way to a location, trying to sell stuff") + EXP DELTA
// (user 2026-10-09 09:20: "+x experience (0.01%) left of the XX.XX%, green if we get experience, red if we lost it").
//
// Page #/live/<leader> (index.html route() hook: LiveParty.route(kind, arg)). #/live without a leader stays the raid live view.
// Data: ONE call per refresh, /api/live?party=<leader> (Dashboard/liveparty_api.js): members' swarm_state (+ route, aggro, cast, escape,
// lastSkill, expLog ...), the last intents of each, monsters around the leader (MCP, cached 3 s). Refresh 1.5 s while open + visible.
// Activity lines: Dashboard/activity.js (window.Activity, shared with the Parties tab). Uses index.html globals: esc, api, patch, go, km, clock, GI, UI, gauge, classIcon, castHtml, intentText, intentResult, niceTask,
// partyColor, roomPolyFor, fieldPolyFor, ugLayer, MT, GD, STATE, TAB, stopChar, charBack.
(function () {
  'use strict';
  const LP = { party: null, open: false, data: null, skew: 0, timer: null, busy: false, follow: true, sel: null, view: null,
    still: {}, tilesKey: '', info: '', err: '', lastOk: 0, raf: 0 };
  const SEC = 'tab-liveparty';
  const $id = (i) => document.getElementById(i);
  const srvNow = () => Date.now() + LP.skew;
  const nf = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
  const pctf = (p) => { const a = Math.abs(p); return (p >= 0 ? '+' : '−') + (a >= 0.1 ? a.toFixed(2) : a >= 0.01 ? a.toFixed(3) : a.toFixed(4)) + '%'; };
  const secs = (ms) => Math.max(0, Math.round(ms / 1000));
  const pcol = (p) => { try { return partyColor(p); } catch (e) { return '#3b82f6'; } };

  // ------------------------------------------------------------------ EXP DELTA (shared with the Parties tab member rows) ----------
  const XSEEN = {};
  /** "+1,234 exp (+0.01%)" span left of the exp %, ~6 s after the change (first seen by this browser), stacked gains summed up. */
  function xpDelta(c, skew, inline) {
    try {
      const L = Array.isArray(c.expLog) && c.expLog.length ? c.expLog : (c.expDelta ? [c.expDelta] : []);
      if (!L.length || (c.ageSec != null && c.ageSec > 30)) return '';
      const last = L[L.length - 1];
      if (!last || !last.amt) return '';
      if (skew == null) skew = (typeof STATE !== 'undefined' && STATE && STATE.now) ? Date.parse(STATE.now) - Date.now() : 0;
      const key = c.name + '|' + last.at, nowB = Date.now();
      let seen = XSEEN[key];
      if (!seen) { if (nowB + skew - last.at > 15000) return ''; seen = XSEEN[key] = nowB; }
      if (nowB - seen > 6200) return '';
      const sign = last.amt > 0 ? 1 : -1;
      const grp = L.filter(x => x && (x.amt > 0 ? 1 : -1) === sign && last.at - x.at <= 6000 && x.at <= last.at);
      const amt = grp.reduce((a, x) => a + (+x.amt || 0), 0), pct = grp.reduce((a, x) => a + (+x.pct || 0), 0);
      const kills = grp.filter(x => /^kill/.test(x.why || '')).length, up = grp.reduce((a, x) => a + (+x.up || 0), 0);
      const mobs = [...new Set(grp.map(x => String(x.why || '').replace(/^kill /, '')).filter(w => w && !/^(other|res|death)$/.test(w)))];
      let txt, cls;
      if (sign > 0) {
        cls = up ? 'gain lvl' : 'gain';
        txt = (up ? 'LEVEL UP! ' : kills > 1 ? `+${kills} kills: ` : '') + `+${nf(amt)} exp (${up ? 'lvl ' + last.lvl + ' ' : ''}${pctf(pct)})` + (last.why === 'res' ? ' res' : '');
      } else {
        cls = 'loss';
        txt = `−${nf(-amt)} exp (${pctf(pct)})` + (grp.some(x => x.why === 'death') ? ' died' : '');
      }
      const title = grp.map(x => `${new Date(x.at).toLocaleTimeString()}: ${x.amt > 0 ? '+' : ''}${nf(x.amt)} exp (${pctf(+x.pct || 0)}) ${x.why || ''}`).join('\n');
      return `<span class="xpd ${cls}${inline ? ' inl' : ''}" id="xpd_${inline ? 'c' : 'r'}_${esc(c.name)}_${last.at}" title="${esc((mobs.length ? mobs.join(', ') + '\n' : '') + title)}">${esc(txt)}</span>`;
    } catch (e) { return ''; }
  }
  setInterval(() => { const t = Date.now(); Object.keys(XSEEN).forEach(k => { if (t - XSEEN[k] > 120000) delete XSEEN[k]; }); }, 60000);
  function expRate(c) {
    const h = c.expHour; if (!h || !(h.mins >= 3) || !h.n) return '';
    // EXP TABLE 2026-10-12: exp points / the level size (LevelEta.hourPct); the plain % sum is too low across a level-up
    const hp = window.LevelEta && LevelEta.hourPct ? LevelEta.hourPct(c) : null;
    const r = hp != null ? hp : h.pct / h.mins * 60, k = h.n / h.mins * 60;
    return `≈${r >= 0 ? '+' : ''}${Math.abs(r) >= 1 ? r.toFixed(1) : r.toFixed(2)} %/h · ${Math.round(k)} kills/h`;
  }

  // ------------------------------------------------------------------ page + routing ------------------------------------------------
  function section() {
    let s = $id(SEC);
    if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win'; s.hidden = true;
    s.innerHTML = `<div class="lp-head"><h2>${GI(UI.map, 'sm')} Live · <span id="lpName"></span></h2>
        <div class="act"><select id="lpParty" title="another party"></select><button id="lpBack" title="back">Back</button></div>
        <div class="lp-sum" id="lpSum" style="flex-basis:100%">loading…</div></div>
      <div class="lp-body"><div class="lp-mapcol">
        <div class="lp-mapwrap" id="lpMap"><svg id="lpSvg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect id="lpBg" fill="#0d2a33"/><g id="lpTiles"></g><g id="lpOver"></g></svg>
          <div class="lp-zoom"><button id="lpZin" title="zoom in">+</button><button id="lpZout" title="zoom out">−</button><button id="lpFollow" title="follow the party (fit everyone)">◎</button></div>
          <div class="lp-info" id="lpInfo"></div></div>
        <div class="lp-legend">${legend()}</div>
        <details class="lp-help"><summary>What does this mean?</summary><ul>
          <li><b>Dots</b> = party members in the party colour; the leader is bigger with ★. Tap a dot or a card to highlight that member; the card has a link to its full character page.</li>
          <li><b>Red ring</b> = fighting. <b>Orange line monster → member</b> = that monster has <b>aggro</b> on the member (it targets or hits it); the card says how many ("3 monsters on me").</li>
          <li><b>Yellow dotted line member → monster</b> = the member's current target. <b>Gold arc</b> around a dot = a cast in progress (it fills up until the cast lands).</li>
          <li><b>Green line</b> = the planned walk (route), the <b>green ring</b> its next waypoint and the flag the goal; the card shows "room 3/7, 420 left". A thin dashed line = a plain walk to a point.</li>
          <li><b>Pulsing red ring "stuck 40 s"</b> = the walker reports it is stuck (it re-plans by itself). An <b>orange ring "not moving"</b> = it should be walking but has not moved for 20+ s (the dashboard noticed, not the bot).</li>
          <li><b>Blue dot</b> = resting, <b>grey</b> = not reporting, <b>dark with ✕</b> = dead. Gold dashed outline = the hunting room / area / square; white dashed = the room chosen on the dashboard that the party has not reached yet.</li>
          <li><b>+1,234 exp (+0.01%)</b> next to the exp % pops up green for ~6 s after a kill (several kills in a row are summed), red when exp was lost (death). "≈ %/h" = exp per hour over the last hour (or since the script started).</li>
          <li>Drag to move, pinch / wheel / + − to zoom; ◎ (green) = follow the party. Updates every 1.5 s while the page is open; monsters come from the leader's client (range 12000, his floor only).</li>
        </ul></details>
      </div><div class="lp-cards" id="lpCards"></div></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    bind(s);
    return s;
  }
  function legend() {
    const sv = (inner) => `<svg viewBox="0 0 16 12">${inner}</svg>`;
    return [
      ['member', sv('<circle cx="8" cy="6" r="4.5" fill="#3b82f6" stroke="#fff" stroke-width="1.2"/>')],
      ['fighting', sv('<circle cx="8" cy="6" r="4.2" fill="#3b82f6" stroke="#ff5a45" stroke-width="2"/>')],
      ['resting', sv('<circle cx="8" cy="6" r="4.5" fill="#5aa9ff" stroke="#fff" stroke-width="1.2"/>')],
      ['dead', sv('<circle cx="8" cy="6" r="4.5" fill="#3a0d0d" stroke="#ff6b5a" stroke-width="1.2"/>')],
      ['stuck', sv('<circle cx="8" cy="6" r="4.6" fill="none" stroke="#e0483c" stroke-width="2"/>')],
      ['casting', sv('<circle cx="8" cy="6" r="4.6" fill="none" stroke="#ffcf4d" stroke-width="2" stroke-dasharray="18 30"/>')],
      ['monster', sv('<circle cx="8" cy="6" r="3" fill="#e0483c" stroke="#000" stroke-width=".6"/>')],
      ['aggro on member', sv('<line x1="1" y1="10" x2="15" y2="2" stroke="#ff7a45" stroke-width="2"/><circle cx="3" cy="9" r="2.6" fill="#e0483c" stroke="#ffb020" stroke-width="1.2"/>')],
      ['target', sv('<line x1="1" y1="6" x2="15" y2="6" stroke="#ffd34d" stroke-width="1.5" stroke-dasharray="2 2"/>')],
      ['route + next point', sv('<polyline points="1,10 6,4 15,6" fill="none" stroke="#3fdc6a" stroke-width="2"/><circle cx="15" cy="6" r="2.3" fill="none" stroke="#3fdc6a" stroke-width="1.3"/>')],
      ['hunting area', sv('<rect x="2" y="2" width="12" height="8" fill="rgba(227,194,122,.15)" stroke="#e3c27a" stroke-dasharray="3 2"/>')],
    ].map(([t, s]) => `<span>${s}${t}</span>`).join('');
  }
  function bind(s) {
    $id('lpBack').onclick = () => { if (typeof charBack === 'function') charBack(); else go('#/parties'); };
    $id('lpParty').onchange = (e) => { if (e.target.value) go('#/live/' + encodeURIComponent(e.target.value)); };
    $id('lpZin').onclick = () => { LP.follow = false; zoomAt(null, 1 / 1.5); };
    $id('lpZout').onclick = () => { LP.follow = false; zoomAt(null, 1.5); };
    $id('lpFollow').onclick = () => { LP.follow = !LP.follow; if (LP.follow) fit(); schedule(); };
    $id('lpCards').addEventListener('click', (e) => {
      if (e.target.closest('a, button, select, input')) return;
      const c = e.target.closest('[data-lpsel]'); if (!c) return;
      LP.sel = LP.sel === c.dataset.lpsel ? null : c.dataset.lpsel;
      LP.info = '';
      renderCards(); schedule();
      if (LP.sel && window.innerWidth < 1280) $id('lpMap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    mapGestures($id('lpMap'));
    window.addEventListener('resize', () => { if (LP.open) { if (LP.follow) fit(); schedule(); } });
    document.addEventListener('keydown', (e) => { if (LP.open && e.key === 'Escape' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) $id('lpBack').click(); });
  }
  function route(kind, arg) {
    if (kind === 'live' && arg) { open(decodeURIComponent(arg)); return true; }
    close();
    return false;
  }
  function open(party) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'liveparty'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.remove('on')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false;
    if (LP.party !== party) { LP.party = party; LP.data = null; LP.sel = null; LP.follow = true; LP.view = null; LP.still = {}; LP.info = ''; LP.tilesKey = ''; $id('lpTiles').innerHTML = ''; $id('lpOver').innerHTML = ''; $id('lpCards').innerHTML = ''; $id('lpCards')._last = null; }
    $id('lpName').textContent = 'Party ' + party;
    LP.open = true;
    window.scrollTo(0, 0);
    if (!LP.timer) LP.timer = setInterval(tick, 1500);
    tick(true);
  }
  function close() {
    if (!LP.open) return;
    LP.open = false;
    const s = $id(SEC); if (s) s.hidden = true;
    if (LP.timer) { clearInterval(LP.timer); LP.timer = null; }
  }
  document.addEventListener('visibilitychange', () => { if (LP.open && !document.hidden) tick(true); });
  async function tick(force) {
    if (!LP.open || (document.hidden && !force) || LP.busy) return;
    LP.busy = true;
    const party = LP.party;
    try {
      const d = await api('/api/live?party=' + encodeURIComponent(party));
      if (!LP.open || LP.party !== party) return;
      if (!d || d.error) { LP.err = (d && d.error) || 'no answer'; if (d && d.parties) LP.data = Object.assign(LP.data || {}, { parties: d.parties }); renderAll(); return; }
      LP.err = ''; LP.data = d; LP.lastOk = Date.now();
      LP.skew = Date.parse(d.now) - Date.now();
      trackStill(d);
      renderAll();
    } catch (e) { LP.err = 'dashboard server not reachable: ' + e.message; renderAll(); }
    finally { LP.busy = false; }
  }

  // ------------------------------------------------------------------ derived state -------------------------------------------------
  // The activity line + route / walk / stuck logic live in Dashboard/activity.js (shared with the Parties tab and the character page,
  // 2026-10-09). Thin wrappers keep the names used by the map below. Without activity.js (dashboard server not restarted yet) the cards
  // fall back to the plain task text.
  const live = (c) => c.ageSec != null && c.ageSec <= 30;
  const AC = () => window.Activity || null;
  function walkIntent(c) { const a = AC(); return a ? a.walkIntent(c) : null; }
  function routeOf(c) { const a = AC(); return a ? a.route(c) : null; }
  function trackStill(d) { const a = AC(); if (a) { a.setSkew(LP.skew); a.track(d.members || []); } }
  function stuckOf(c) { const a = AC(); return a ? a.stuck(c) : null; }
  /** monsters with aggro on this member: its own report (swarm_state.aggro, new swarm.js), else its escape list, else MCP target ids */
  function aggroOf(c, mobs) {
    if (Array.isArray(c.aggro)) return c.aggro;
    if (c.escape && Array.isArray(c.escape.mobs)) return c.escape.mobs.filter(m => m.on || m.hit);
    if (c.oid) return (mobs || []).filter(m => m.tgt && +m.tgt === +c.oid);
    return [];
  }
  function targetPos(c, mobs) {
    if (c.tpos && isFinite(c.tpos.x)) return c.tpos;
    const t = c.doing && c.doing.target; if (!t || !t.name) return null;
    let best = null, bd = 1e9;
    (mobs || []).forEach(m => { if (m.n !== t.name) return; const dd = Math.hypot(m.x - c.x, m.y - c.y); if (dd < bd && dd < Math.max(1500, (t.dist || 0) + 400)) { bd = dd; best = m; } });
    return best;
  }

  /** ONE line in plain words: what this member does right now (Dashboard/activity.js) */
  function activity(c, d) {
    const a = AC();
    if (a) { a.setSkew(LP.skew); return a.member(c, d); }
    return { ic: UI.idle, h: esc(niceTask(c.task)) || 'idle' };
  }

  // ------------------------------------------------------------------ cards (v2, user 2026-10-09 13:00) -----------------------------
  // "I want to see what is going on, with animations, casting bars etc.": one animated card per member in the raid HUD's component style
  // (Dashboard/raidlive.css: .rlh-mem box + damage/heal flash, .rlh-ci cast icon with the sweep ON TOP of the icon, .rlh-cd cooldown slots),
  // laid out as a page-level grid (no inner scroll box). Rows: 1 who + exp | 2 CP/HP/MP | 3 doing now (cast icon / activity icon + the
  // activity.js line) | 3b cast bar with time left | 4 target with its HP, or the route progress | 5 key skills with cooldown sweeps |
  // 6 buffs + debuffs with time bars | 7 chips (aggro pulse, stuck, low supplies, exp/h) | 8 the last 3 things it tried.
  const FX = {}, SKH = {}, BMAX = {};
  const POT = /potion|elixir|nectar|healing drug|herb|scroll of/i;
  const skName = (id) => { try { return ((GD.skills || {})[id] || [])[0] || ('skill ' + id); } catch (e) { return 'skill ' + id; } };
  const skIc = (id) => { try { return skillIcon(id); } catch (e) { return '/icons/icon/etc_question_mark_i00.png'; } };
  /** damage taken / heal received since the last refresh -> a short card flash (class alternates so the CSS animation restarts) */
  function flashOf(c) {
    const f = FX[c.name] || (FX[c.name] = { hp: c.hp, n: 0, kind: '', until: 0 });
    if (c.hp != null && f.hp != null && !c.dead && live(c)) {
      if (c.hp <= f.hp - 3) Object.assign(f, { kind: 'dmg', n: f.n + 1, until: Date.now() + 1100 });
      else if (c.hp >= f.hp + 3) Object.assign(f, { kind: 'heal', n: f.n + 1, until: Date.now() + 1100 });
    }
    f.hp = c.hp;
    return Date.now() < f.until ? ` fx-${f.kind}-${f.n % 2}` : '';
  }
  /** the cast icon: skill icon with a sweep on top while casting (data-t0/dur animated by the ticker below) */
  function castIcon(c, a) {
    const k = c.cast;
    if (c.dead) return '<span class="rlh-ci dead">✝</span>';
    if (k && !k.ended && live(c) && !(window.castGone && castGone(k, srvNow()))) {
      const el = Math.max(0, srvNow() - Date.parse(k.start)), ms = +k.ms || 0;
      const src = k.kind === 'soe' ? itemIcon(k.id || 736) : k.kind === 'town' ? '/icons/' + UI.map + '.png' : skIc(k.skill || k.id);
      return `<span class="rlh-ci${ms ? ' casting' : ''}"${ms ? ` data-t0="${Math.round((Date.now() - el) / 250) * 250}" data-dur="${ms}" style="--p:${Math.min(100, Math.round(100 * el / ms))}%"` : ''}><img src="${src}" alt=""></span>`;
    }
    const ls = c.lastSkill;
    if (ls && ls.id && srvNow() - Date.parse(ls.at) < 4000) return `<span class="rlh-ci used" title="just used ${esc(skName(ls.id))}"><img src="${skIc(ls.id)}" alt=""></span>`;
    return `<span class="rlh-ci act">${GI(a.ic || UI.idle, '')}</span>`;
  }
  /** cast bar with the time left (index.html animates .castbar[data-start] every 200 ms) */
  function castBar(c) {
    const k = c.cast; if (!k || !live(c) || (k.ended && srvNow() - Date.parse(k.endedAt || k.start) > 8000) || (!k.ended && window.castGone && castGone(k, srvNow()))) return '';
    const cls = k.ended ? (/interrupt|refused|resist|fail|no teleport/.test(k.ended) ? 'int' : 'ok') : '';
    return `<div class="lp-cast"><span class="nm">${k.kind === 'town' ? 'Teleport ' : ''}<b>${esc(k.name || skName(k.skill || k.id))}</b>${k.target ? ' → ' + esc(k.target) : ''}</span>
      <div class="castbar ${cls}" data-start="${esc(k.start)}" data-ms="${+k.ms || 0}" data-ended="${esc(k.ended || '')}"><i></i><span></span></div></div>`;
  }
  /** key skills: the ones this member used / has on cooldown lately (remembered by the browser), with the game's cooldown sweep */
  function keySkills(c) {
    const h = SKH[c.name] || (SKH[c.name] = { seen: {}, tot: {} });
    const nowB = Date.now(), age = ((+c.ageSec || 0) * 1000);
    const see = (id, at) => { if (id && !POT.test(skName(id))) h.seen[id] = Math.max(h.seen[id] || 0, at); };
    if (c.lastSkill && c.lastSkill.id) see(+c.lastSkill.id, Date.parse(c.lastSkill.at) - LP.skew);
    if (c.cast && c.cast.kind === 'skill' && (c.cast.skill || c.cast.id)) see(+(c.cast.skill || c.cast.id), Date.parse(c.cast.start) - LP.skew);
    const ov = {}; (c.ovSkills || []).forEach(k => { ov[k.id] = k; if (!k.ready && k.cd > 0) { see(+k.id, h.seen[k.id] || nowB); h.tot[k.id] = Math.max(h.tot[k.id] || 0, k.cd); } });
    const ids = Object.keys(h.seen).sort((x, y) => h.seen[y] - h.seen[x]).slice(0, 7);
    return ids.map(id => {
      const k = ov[id], rem = k && !k.ready ? Math.max(0, k.cd - age) : 0, tot = Math.max(h.tot[id] || 0, rem);
      const on = rem > 0 && tot > 0, left = Math.ceil(rem / 1000);
      const st = on ? ` data-t0="${Math.round((nowB - (tot - rem)) / 250) * 250}" data-dur="${tot}" data-cd="1" style="--p:${Math.round(100 * rem / tot)}%"` : '';
      return `<span class="rlh-cd ${on ? 'on' : ''}" title="${esc(skName(id))}${on ? ' · ready in ' + left + ' s' : ' · ready'}"><img src="${skIc(id)}" alt="" loading="lazy"><i class="sw"${st}></i>${on ? `<b class="cdn">${left}</b>` : ''}</span>`;
    }).join('');
  }
  /** buff + debuff icons with a time bar (swarm_state.buffList); without it: the old count chip + debuff chips */
  function buffRow(c) {
    const bl = Array.isArray(c.buffList) ? c.buffList : null;
    if (bl && bl.length) {
      const mx = BMAX[c.name] || (BMAX[c.name] = {});
      const one = (b) => { const k = b.id + (b.deb ? 'd' : ''); mx[k] = Math.max(mx[k] || 0, +b.left || 0); const p = mx[k] ? Math.round(100 * (+b.left || 0) / mx[k]) : 0;
        const t = b.left >= 3600 ? Math.floor(b.left / 3600) + 'h' + String(Math.floor(b.left % 3600 / 60)).padStart(2, '0') : b.left >= 60 ? Math.round(b.left / 60) + ' min' : b.left + ' s';
        return `<span class="lp-bf${b.deb ? ' deb' : ''}${b.left < 60 ? ' low' : ''}" title="${b.deb ? 'debuff: ' : ''}${esc(skName(b.id))} · ${t} left"><img src="${skIc(b.id)}" alt="" loading="lazy"><i style="width:${p}%"></i></span>`; };
      const bad = bl.filter(b => b.deb), good = bl.filter(b => !b.deb).sort((x, y) => x.left - y.left);
      const shown = bad.concat(good).slice(0, 14);
      return `<div class="lp-bfs">${shown.map(one).join('')}${bl.length > shown.length ? `<span class="lp-bfn">+${bl.length - shown.length}</span>` : ''}<span class="lp-bfn">${good.length} buffs${bad.length ? ' · <b class="bad">' + bad.length + ' debuff' + (bad.length > 1 ? 's' : '') + '</b>' : ''}</span></div>`;
    }
    if (!live(c)) return '';
    const bl2 = +c.buffLeft || 0;
    return `<div class="lp-bfs"><span class="chip${c.buffs < 10 ? ' bad' : ''}" title="long buffs (longest ${Math.floor(bl2 / 3600)}h${String(Math.floor(bl2 % 3600 / 60)).padStart(2, '0')} left)">${GI(UI.buff, 'sm')}${c.buffs} buffs</span>` +
      (c.deb || []).slice(0, 4).map(x => `<span class="chip deb" title="debuff">${GI(UI.debuff, 'sm')}${esc(String(x).toLowerCase().replace(/_/g, ' '))}</span>`).join('') + '</div>';
  }
  /** target with its HP, else the route progress, else nothing */
  function targetRow(c, d) {
    if (!live(c) || c.dead) return '';
    const t = c.doing && c.doing.target;
    if (t && t.name) {
      const hp = Math.max(0, Math.min(100, +t.hp || 0));
      const raid = (d.mobs || []).some(m => m.raid && m.n === t.name);
      return `<div class="lp-tg${raid ? ' raid' : ''}"><span class="tn">${raid ? '♛' : '⚔'} <b>${esc(t.name)}</b></span><span class="tb"><i style="width:${hp}%"></i><em>${hp}%</em></span><span class="td">${t.dist != null ? km(t.dist) : ''}</span></div>`;
    }
    const np = c.doing && c.doing.npc;   // NPC TARGETS 2026-10-13: a selected NPC is a visit, not a fight
    if (np && np.name) return `<div class="lp-rt"><span class="tn">💬 ${np.dist != null && np.dist > 300 ? 'going to' : 'at'} <b>${esc(np.name)}</b></span><span class="tb"></span><span class="td">${np.dist != null && np.dist > 300 ? km(np.dist) : ''}</span></div>`;
    const r = routeOf(c);
    if (r && !r.done) {
      const p = Math.round(100 * Math.min(r.i, r.pts.length) / r.pts.length);
      return `<div class="lp-rt"><span class="tn">➜ <b>${esc(r.label || 'route')}</b></span><span class="tb"><i style="width:${p}%"></i><em>${Math.min(r.i + 1, r.pts.length)}/${r.pts.length}</em></span><span class="td">${km(r.left)} left</span></div>`;
    }
    return '';
  }
  function card(c, d) {
    const a = activity(c, d), st = stuckOf(c), ag = live(c) && !c.dead ? aggroOf(c, d.mobs) : [];
    const col = pcol(d.party);
    const chips = [];
    if (ag.length) chips.push(`<span class="chip aggro${ag.some(m => m.hit) ? ' hit' : ''}" title="${esc(ag.map(m => m.n + (m.lvl ? ' ' + m.lvl : '') + (m.hit ? ' (hits)' : '')).join(', '))}">${ag.length} monster${ag.length > 1 ? 's' : ''} on me</span>`);
    if (st) chips.push(`<span class="chip stuck${st.hard ? '' : ' soft'}">${st.hard ? 'stuck' : 'not moving'}${st.sec != null ? ' ' + st.sec + ' s' : ''}${st.replans ? ' · re-plan ' + st.replans : ''}</span>`);
    if (live(c)) {
      if (c.soe != null && c.soe < 2) chips.push(`<span class="chip bad">SoE ${c.soe}</span>`);
      if (c.shots != null && c.shots <= 100) chips.push(`<span class="chip bad">shots ${c.shots}</span>`);
      const rate = expRate(c); if (rate) chips.push(`<span class="rate" title="exp over the last ${c.expHour.mins} min: ${pctf(c.expHour.pct)}, ${nf(c.expHour.amt)} exp, ${c.expHour.n} gains">${esc(rate)}</span>`);
    }
    const plain = !!(window.Plain && window.UIKit && !UIKit.isAdv());   // UX audit B3 (2026-10-13): Simple view = plain words (Dashboard/plainwords.js)
    const tl = (c.intents || []).slice(0, 3).map((e, i) => {
      const P = plain ? Plain.event(e) : null;
      const [cls, res] = plain ? Plain.result(e, i === 0) : intentResult(e, i === 0);
      const txt = plain ? P.text : intentText(e);
      return `<div title="${esc(txt + (plain ? (P.why ? ' — ' + P.why : '') : (e.task ? ' — while: ' + e.task : '')) + ' — ' + res)}"><span class="t">${clock(e.at).slice(0, 5)}</span><span class="w">${esc(txt)}${e.count > 1 ? ' ×' + e.count : ''}</span><span class="r ${cls}">${cls === 'ok' ? '✓' : cls === 'bad' ? '✗' : cls === 'run' ? '…' : ''}</span></div>`;
    }).join('');
    const cb = castBar(c);
    if (cb) a.h = String(a.h).replace(/ \((\d+(\.\d)?) s left\)| \(finishing\)/, '');   // the cast bar below shows the live time left
    const keys = live(c) ? keySkills(c) : '';
    const xd = xpDelta(c, LP.skew, true);   // the exp pop-up takes the class line (left of the exp %), the name stays readable
    const hpc = c.dead ? '' : c.hp < 30 ? ' crit' : c.hp < 60 ? ' warn' : '';
    const gN = (k, v, lab) => v == null ? `<div class="gauge ${k} unk"><i style="width:0%"></i><span>${lab} ?</span></div>` : gauge(k, v, lab + ' ' + Math.round(v) + '%');
    return `<div class="rlh-mem lpc lpm${hpc}${c.dead ? ' dead' : ''}${live(c) ? '' : ' stale'}${st && st.hard ? ' stuck' : ''}${ag.length >= 2 ? ' aggro2' : ''}${LP.sel === c.name ? ' sel' : ''}${flashOf(c)}" data-lpsel="${esc(c.name)}" id="lpc_${esc(c.name)}" style="--pc:${col}">
      <div class="lp-r1">${classIcon(c)}<span class="who"><span class="nl"><span class="lvl">${c.level}</span><b class="n">${esc(c.name)}</b>${c.name === d.leader ? GI(UI.star, 'sm', 'party leader') : ''}</span>
        <span class="sub">${xd || esc(c.cls || c.role || '')}</span></span>
        <span class="xp" title="experience in this level">${(Math.round((+c.exp || 0) * 100) / 100).toFixed(2)}%${window.LevelEta && live(c) ? LevelEta.shortHtml(c, { skew: LP.skew }) : ''}</span>
        <a class="open" href="#/char/${encodeURIComponent(c.name)}" title="open the full character page">open ›</a></div>
      <div class="lp-r2">${gN('cp', c.cp, 'CP')}${c.dead ? gauge('hp', 0, 'dead') : gN('hp', c.hp, 'HP')}${gN('mp', c.mp, 'MP')}</div>
      <div class="lp-r3">${castIcon(c, a)}<div class="lact ${a.cls || ''}"><span>${a.h}</span></div></div>
      ${cb}${targetRow(c, d)}
      ${keys ? `<div class="lp-keys">${keys}</div>` : ''}
      ${buffRow(c)}
      ${chips.length ? `<div class="chips2">${chips.join('')}</div>` : ''}
      ${tl ? `<div class="tl5">${tl}</div>` : ''}
    </div>`;
  }
  /** cast sweeps + cooldown sweeps move smoothly between the 1.5 s refreshes (the start is in data-t0 = this browser's clock) */
  setInterval(() => {
    if (!LP.open || document.hidden) return;
    const now = Date.now();
    document.querySelectorAll('#lpCards [data-t0][data-dur]').forEach(e => {
      const dur = +e.dataset.dur || 1, el = now - (+e.dataset.t0 || now), cd = e.dataset.cd === '1';
      const p = Math.max(0, Math.min(100, cd ? 100 * (dur - el) / dur : 100 * el / dur));
      e.style.setProperty('--p', p.toFixed(1) + '%');
      if (cd) { const b = e.parentNode && e.parentNode.querySelector('.cdn'); if (b) b.textContent = p > 0 ? String(Math.ceil((dur - el) / 1000)) : ''; if (p <= 0 && e.parentNode) e.parentNode.classList.remove('on'); }
    });
  }, 100);
  function renderCards() {
    const d = LP.data; if (!d || !d.members) return;
    const list = d.members.slice().sort((a, b) => (b.name === d.leader) - (a.name === d.leader) || a.name.localeCompare(b.name));
    patch($id('lpCards'), list.map(c => card(c, d)).join(''));
  }
  function renderHead() {
    const d = LP.data || {}, ms = d.members || [];
    const sel = $id('lpParty'), parties = d.parties || [];
    const opts = parties.map(p => `<option value="${esc(p)}"${p === LP.party ? ' selected' : ''}>Party ${esc(p)}</option>`).join('');
    if (sel.dataset.opts !== opts) { sel.innerHTML = opts; sel.dataset.opts = opts; }
    if (LP.err && !ms.length) { $id('lpSum').innerHTML = `<span class="bad">${esc(LP.err)}</span>`; return; }
    const lv = ms.map(c => +c.level || 0), on = ms.filter(live).length, fight = ms.filter(c => live(c) && (c.combat || (c.doing && c.doing.target))).length;
    const ag = ms.reduce((a, c) => a + (live(c) ? aggroOf(c, d.mobs).length : 0), 0), dead = ms.filter(c => c.dead).length, stuck = ms.filter(c => stuckOf(c)).length;
    $id('lpSum').innerHTML = `<b>${on}/${ms.length}</b> online · lvl ${lv.length ? Math.min(...lv) + '–' + Math.max(...lv) : '?'}${window.LevelEta ? ' · ' + LevelEta.partyHtml(ms, { skew: LP.skew }) : ''} · <b>${fight}</b> fighting` +
      (ag ? ` · <span class="bad"><b>${ag}</b> monsters on the party</span>` : '') + (dead ? ` · <span class="bad">${dead} dead</span>` : '') + (stuck ? ` · <span class="bad">${stuck} stuck / not moving</span>` : '') +
      ` · updated ${d.now ? clock(d.now) : '?'}` + `<span data-adv> · monsters: ${esc(d.mobsSrc || 'none')}${d.mobsAge != null && d.mobsAge > 6 ? ' (' + d.mobsAge + ' s old)' : ''}</span>` + (LP.err ? ` · <span class="bad">${esc(LP.err)}</span>` : '');
  }
  function renderAll() { renderHead(); renderCards(); if (LP.follow || !LP.view) fit(); schedule(); }

  // ------------------------------------------------------------------ map -----------------------------------------------------------
  function box() { const w = $id('lpMap'); return { w: Math.max(50, w.clientWidth), h: Math.max(50, w.clientHeight) }; }
  function fit() {
    const d = LP.data; if (!d || !d.members) return;
    const L = d.members.find(c => c.name === d.leader) || d.members[0];
    if (!L || !isFinite(L.x)) return;
    const pts = [];
    d.members.forEach(c => { if (isFinite(c.x) && Math.hypot(c.x - L.x, c.y - L.y) < 20000) { pts.push([c.x, c.y]);
      const r = routeOf(c); if (r && !r.done) { r.pts.slice(r.i, r.i + 12).forEach(p => { if (Math.hypot(p[0] - L.x, p[1] - L.y) < 20000) pts.push(p); }); }
      aggroOf(c, d.mobs).forEach(m => pts.push([m.x, m.y])); } });
    const z = L.zone; if (z && isFinite(z.x) && Math.hypot(z.x - L.x, z.y - L.y) < 20000) { if (Array.isArray(z.poly) && z.poly.length > 2) z.poly.forEach(p => pts.push(p)); else pts.push([z.x - z.r / 2, z.y - z.r / 2], [z.x + z.r / 2, z.y + z.r / 2]); }
    if (!pts.length) pts.push([L.x, L.y]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const b = box(), pad = 500;
    const hw = Math.min(40000, Math.max(1100, (maxX - minX) / 2 + pad, ((maxY - minY) / 2 + pad) * b.w / b.h));
    LP.view = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, hw };
  }
  function viewRect() {
    const b = box(), v = LP.view, hh = v.hw * b.h / b.w;
    return { x0: v.cx - v.hw, y0: v.cy - hh, W: 2 * v.hw, H: 2 * hh, u: 2 * v.hw / b.w, b };
  }
  function zoomAt(px, f, py) {
    if (!LP.view) return;
    const R = viewRect();
    if (px == null) { px = R.b.w / 2; py = R.b.h / 2; }
    const gx = R.x0 + px * R.u, gy = R.y0 + py * R.u;
    const hw = Math.max(250, Math.min(60000, LP.view.hw * f)), u2 = 2 * hw / R.b.w;
    LP.view = { hw, cx: gx - px * u2 + hw, cy: gy - py * u2 + hw * R.b.h / R.b.w };
    schedule();
  }
  function schedule() { if (LP.raf) return; LP.raf = requestAnimationFrame(() => { LP.raf = 0; drawMap(); }); }
  function mapGestures(el) {
    const P = new Map(); let moved = 0, last = null;
    const pos = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      try { el.setPointerCapture(e.pointerId); } catch (er) { }
      P.set(e.pointerId, pos(e)); moved = P.size > 1 ? 99 : 0; last = null;
    });
    el.addEventListener('pointermove', (e) => {
      if (!P.has(e.pointerId) || !LP.view) return;
      const prev = P.get(e.pointerId), p = pos(e);
      if (P.size === 1) {
        const R = viewRect(), dx = p.x - prev.x, dy = p.y - prev.y;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 6) { LP.follow = false; LP.view.cx -= dx * R.u; LP.view.cy -= dy * R.u; schedule(); }
      } else if (P.size === 2) {
        const [a, b] = [...P.entries()].map(([id, q]) => id === e.pointerId ? p : q);
        const [a0, b0] = [...P.values()];
        const d1 = Math.hypot(a.x - b.x, a.y - b.y), d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
        if (d0 > 10 && d1 > 10) {
          LP.follow = false;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, m0x = (a0.x + b0.x) / 2, m0y = (a0.y + b0.y) / 2, R = viewRect();
          LP.view.cx -= (mx - m0x) * R.u; LP.view.cy -= (my - m0y) * R.u;
          zoomAt(mx, d0 / d1, my);
        }
      }
      P.set(e.pointerId, p);
    });
    const up = (e) => {
      if (!P.has(e.pointerId)) return;
      const p = pos(e); P.delete(e.pointerId);
      if (moved <= 6 && P.size === 0 && e.type === 'pointerup') tap(p);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); LP.follow = false; const p = pos(e); zoomAt(p.x, e.deltaY > 0 ? 1.25 : 0.8, p.y); }, { passive: false });
  }
  function tap(p) {
    const d = LP.data; if (!d || !LP.view) return;
    const R = viewRect(), gx = R.x0 + p.x * R.u, gy = R.y0 + p.y * R.u;
    let best = null, bd = 18 * R.u;
    (d.members || []).forEach(c => { if (!isFinite(c.x)) return; const dd = Math.hypot(c.x - gx, c.y - gy); if (dd < bd) { bd = dd; best = c; } });
    if (best) {
      LP.sel = LP.sel === best.name ? null : best.name; LP.info = '';
      renderCards(); schedule();
      const el = $id('lpc_' + best.name); if (el && LP.sel) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    let mb = null; bd = 14 * R.u;
    allMobs(d).forEach(m => { const dd = Math.hypot(m.x - gx, m.y - gy); if (dd < bd) { bd = dd; mb = m; } });
    LP.info = mb ? `${mb.n}${mb.lvl ? ' lvl ' + mb.lvl : ''}${mb.hp != null ? ' · ' + mb.hp + '% HP' : ''}${mb.on.length ? ' · aggro on ' + mb.on.join(', ') : ''}${mb.ag ? ' · aggressive' : ''}` : '';
    if (!mb) { LP.sel = null; renderCards(); }
    schedule();
  }
  /** monsters around the leader + every member's aggro list, merged (same id, or same name within 80) */
  function allMobs(d) {
    const out = [];
    (d.mobs || []).forEach(m => out.push(Object.assign({}, m, { on: [] })));
    (d.members || []).forEach(c => {
      if (!live(c) || c.dead) return;
      aggroOf(c, d.mobs).forEach(a => {
        let m = out.find(o => (a.id && o.id && +o.id === +a.id) || (o.n === a.n && Math.hypot(o.x - a.x, o.y - a.y) < 80));
        if (!m) { m = Object.assign({}, a, { on: [] }); out.push(m); }
        if (!m.on.includes(c.name)) m.on.push(c.name);
        if (a.cc) m.cc = a.cc;
      });
    });
    return out;
  }
  function drawMap() {
    const d = LP.data; if (!LP.open || !d || !d.members || !LP.view) return;
    // MAP ART per floor 2026-10-13: the reference member switched floor (teleport into / out of a dungeon, floor teleporter, death -> town):
    // follow + re-centre at once, the art below follows the new floor
    try { const r0 = (LP.sel && d.members.find(c => c.name === LP.sel)) || d.members.find(c => c.name === d.leader) || d.members[0];
      const lv0 = window.MapFloors && r0 && r0.z != null && isFinite(r0.z) ? MapFloors.view('lp:' + r0.name, r0) : null; if (lv0 && lv0.changed) { LP.follow = true; fit(); } } catch (e) { }
    const R = viewRect(), { x0, y0, W, H, u } = R;
    const svg = $id('lpSvg');
    svg.setAttribute('viewBox', `${x0} ${y0} ${W} ${H}`);
    const bg = $id('lpBg'); bg.setAttribute('x', x0 - W); bg.setAttribute('y', y0 - H); bg.setAttribute('width', 3 * W); bg.setAttribute('height', 3 * H);
    const L = d.members.find(c => c.name === d.leader) || d.members[0];
    const ref = (LP.sel && d.members.find(c => c.name === LP.sel)) || L;
    // map pieces (the same /minitile art as the party map; underground / stacked floors by the reference member's height)
    let key = '', imgs = '';
    if (typeof MT !== 'undefined' && W < 90000 && typeof floorTiles === 'function') {   // MAP ART per floor 2026-10-13 (index.html floorTiles)
      const T = floorTiles('lp:' + ref.name, ref, x0, y0, W, H, u); imgs = T.imgs; key = T.key + (T.plain ? u.toFixed(2) : '') + imgs.length + imgs.slice(0, 120) + imgs.slice(-160);
    } else if (typeof MT !== 'undefined' && W < 90000) {
      for (let gx = Math.floor(x0 / MT); gx * MT < x0 + W; gx++) for (let gy = Math.floor(y0 / MT); gy * MT < y0 + H; gy++) {
        const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, cc = gx - Math.floor(gx / 4) * 4, rr = gy - Math.floor(gy / 4) * 4;
        let lay = ''; try { lay = ugLayer(RX, RY, ref.z, ref.x, ref.y); } catch (e) { }
        const src = `/minitile/${RX}_${RY}${lay}_${cc}_${rr}.jpg`;
        key += src; imgs += `<image href="${src}" x="${gx * MT}" y="${gy * MT}" width="${MT}" height="${MT}" preserveAspectRatio="none"/>`;
      }
    }
    if (key !== LP.tilesKey) { LP.tilesKey = key; $id('lpTiles').innerHTML = imgs; }
    $id('lpOver').innerHTML = overlay(d, R, L);
    $id('lpFollow').classList.toggle('on', LP.follow);
    const far = d.members.filter(c => L && isFinite(c.x) && Math.hypot(c.x - L.x, c.y - L.y) >= 20000);
    const MF = window.MapFloors, off = MF && ref ? d.members.filter(c => c !== ref && isFinite(c.x) && !far.includes(c) && c.z != null && !MF.same(ref, c, MF.CHAR_DZ)) : [];   // MAP FLOORS 2026-10-13
    $id('lpInfo').textContent = LP.info || (LP.sel ? selInfo(d, LP.sel) : '') || [far.length ? 'far away: ' + far.map(c => c.name + ' ' + km(Math.hypot(c.x - L.x, c.y - L.y))).join(', ') : '', off.length ? 'other floor: ' + off.map(c => c.name + ' (' + (MF.name(c) || '?') + ')').join(', ') : ''].filter(Boolean).join(' · ');
    animArcs();
  }
  function selInfo(d, name) {
    const c = d.members.find(m => m.name === name); if (!c) return '';
    const a = activity(c, d); const tmp = document.createElement('div'); tmp.innerHTML = a.h;
    return `${c.name}: ${tmp.textContent}`;
  }
  function overlay(d0, R, L) {
    const { x0, y0, W, H, u } = R;
    // MAP FLOORS 2026-10-13 (user: maps showed other floors): only what is on the floor / level of the map's reference member (the selected one,
    // else the leader; the map art follows the same member) — members, monsters, aggro, zone and chosen room (Dashboard/mapfloors.js)
    const ref = (LP.sel && d0.members.find(c => c.name === LP.sel)) || L, MF = window.MapFloors;
    const here = (p, tol) => !MF || !ref || !p || p.z == null || MF.same(ref, p, tol == null ? MF.CHAR_DZ : tol);
    const d = Object.assign({}, d0, { members: d0.members.filter(c => c === ref || here(c)), mobs: (d0.mobs || []).filter(m => m.raid || here(m, 600)) });
    const inV = (x, y, m) => x > x0 - (m || 0) && x < x0 + W + (m || 0) && y > y0 - (m || 0) && y < y0 + H + (m || 0);
    const label = (x, y, t, size, fill, anchor) => `<text x="${x}" y="${y}"${anchor ? ' text-anchor="' + anchor + '"' : ''} font-size="${(size || 11) * u}" fill="${fill || '#fff'}" paint-order="stroke" stroke="#000" stroke-width="${3 * u}" stroke-linejoin="round">${esc(t)}</text>`;
    const poly = (P, fill, stroke, dash, w) => `<polygon points="${P.map(p => p[0] + ',' + p[1]).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${(w || 1.6) * u}"${dash ? ` stroke-dasharray="${dash.map(x => x * u).join(' ')}"` : ''}/>`;
    const col = pcol(d.party);
    let s = '';
    // hunting zone (room / field area polygon, else the square) + the room chosen on the dashboard that the party has not reached yet
    const z = L && L.zone;
    if (z && isFinite(z.x) && (!MF || MF.zone(ref, z))) {
      let zp = Array.isArray(z.poly) && z.poly.length > 2 ? z.poly : null;
      try { if (!zp && z.room) zp = roomPolyFor(String(z.name || '').split(':')[0].trim(), z.room); } catch (e) { }
      if (zp) { const xs = zp.map(p => p[0]), ys = zp.map(p => p[1]); s += poly(zp, 'rgba(227,194,122,.12)', '#e3c27a', [8, 5]) + label(Math.min(...xs), Math.min(...ys) - 6 * u, (z.drawn ? 'hunting (drawn area): ' : z.area ? 'area: ' : z.room ? 'room: ' : '') + (z.name || z.room || ''), 10, '#e3c27a'); }
      else if (z.r) { const h = z.r / 2; s += `<rect x="${z.x - h}" y="${z.y - h}" width="${z.r}" height="${z.r}" fill="rgba(227,194,122,.07)" stroke="#e3c27a" stroke-width="${1.6 * u}" stroke-dasharray="${8 * u} ${5 * u}"/>` + label(z.x - h + 4 * u, z.y - h - 5 * u, 'hunting: ' + (z.name || ''), 10, '#e3c27a'); }
    }
    const ms = L && L.manualSpot;
    if (ms && ms.mode === 'manual' && ms.status !== 'arrived' && Array.isArray(ms.poly) && ms.poly.length > 2 && !(z && z.room && z.room === ms.room) && !(MF && MF.room(ref, ms.room) === false)) {
      const xs = ms.poly.map(p => p[0]), ys = ms.poly.map(p => p[1]);
      s += poly(ms.poly, 'rgba(255,255,255,.07)', '#fff', [4, 4]) + label(Math.min(...xs), Math.max(...ys) + 13 * u, 'chosen: ' + (ms.room || ms.spot || '') + ' · ' + (ms.status || ''), 10, '#fff');
    }
    if (L && L.combatRange && L.combatRange < 20000 && here(L)) s += `<circle cx="${L.x}" cy="${L.y}" r="${L.combatRange}" fill="none" stroke="${col}" stroke-width="${u}" stroke-dasharray="${3 * u} ${4 * u}" opacity=".55"/>`;
    // routes / walks / escapes
    const goals = [];
    d.members.forEach(c => {
      if (!isFinite(c.x) || !live(c)) return;
      const r = routeOf(c);
      if (r && !r.done) {
        const sel = LP.sel === c.name, w = sel ? 3 : 2;
        if (r.i > 0) s += `<polyline points="${r.pts.slice(0, r.i + 1).map(p => p[0] + ',' + p[1]).join(' ')}" fill="none" stroke="#3fdc6a" stroke-width="${1.2 * u}" opacity=".35"/>`;
        s += `<polyline points="${[[c.x, c.y]].concat(r.pts.slice(r.i)).map(p => p[0] + ',' + p[1]).join(' ')}" fill="none" stroke="#3fdc6a" stroke-width="${w * u}" stroke-linejoin="round" opacity="${sel || !LP.sel ? .95 : .45}"/>`;
        r.pts.slice(r.i + 1, -1).forEach(p => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="${2.2 * u}" fill="#3fdc6a" opacity=".8"/>`; });
        const nx = r.pts[r.i]; s += `<circle cx="${nx[0]}" cy="${nx[1]}" r="${6 * u}" fill="none" stroke="#3fdc6a" stroke-width="${2 * u}"/>`;
        const g = r.goal; s += `<path d="M${g[0]} ${g[1]} v${-16 * u} l${10 * u} ${4 * u} l${-10 * u} ${4 * u}" fill="#3fdc6a" stroke="#000" stroke-width="${0.8 * u}"/>`;
        if (r.label && (sel || !LP.sel) && !goals.some(o => o[2] === r.label && Math.hypot(o[0] - g[0], o[1] - g[1]) < 300)) { goals.push([g[0], g[1], r.label]); s += label(g[0] + 12 * u, g[1] - 8 * u, r.label, 10, '#9ff5b0'); }
      } else {
        const wi = walkIntent(c);
        if (wi && Math.hypot(wi.to[0] - c.x, wi.to[1] - c.y) > 150) s += `<line x1="${c.x}" y1="${c.y}" x2="${wi.to[0]}" y2="${wi.to[1]}" stroke="#bfe8c8" stroke-width="${1.2 * u}" stroke-dasharray="${5 * u} ${4 * u}" opacity=".75"/><circle cx="${wi.to[0]}" cy="${wi.to[1]}" r="${4 * u}" fill="none" stroke="#bfe8c8" stroke-width="${1.5 * u}"/>`;
      }
      const e = c.escape;
      if (e && e.on && e.target) {
        const path = [[c.x, c.y]].concat(e.target.path && e.target.path.length ? e.target.path : [[e.target.x, e.target.y]]);
        s += `<polyline points="${path.map(p => p[0] + ',' + p[1]).join(' ')}" fill="none" stroke="#ffd34d" stroke-width="${2 * u}" stroke-dasharray="${6 * u} ${4 * u}"/>` + label(e.target.x + 8 * u, e.target.y - 6 * u, 'escape: ' + (e.target.label || 'safe spot'), 9.5, '#ffd34d');
      }
    });
    // raid target spawn
    if (d.target && inV(d.target.x, d.target.y, 2000)) s += `<circle cx="${d.target.x}" cy="${d.target.y}" r="${14 * u}" fill="none" stroke="#f0c040" stroke-width="${1.6 * u}" stroke-dasharray="${4 * u} ${3 * u}"/>` + label(d.target.x + 16 * u, d.target.y + 4 * u, '♛ ' + d.target.n, 10, '#f0c040');
    // monsters + aggro lines (monster -> member) + target lines (member -> monster)
    const mobs = allMobs(d);
    const byName = {}; d.members.forEach(c => { byName[c.name] = c; });
    mobs.forEach(m => { m.on.forEach(n => { const c = byName[n]; if (c && isFinite(c.x)) s += `<line x1="${m.x}" y1="${m.y}" x2="${c.x}" y2="${c.y}" stroke="#ff7a45" stroke-width="${(LP.sel === n ? 2.6 : 1.7) * u}" opacity=".9"/>`; }); });
    d.members.forEach(c => {
      if (!live(c) || c.dead || !isFinite(c.x)) return;
      const tp = targetPos(c, mobs); if (!tp || !isFinite(tp.x)) return;
      s += `<line x1="${c.x}" y1="${c.y}" x2="${tp.x}" y2="${tp.y}" stroke="#ffd34d" stroke-width="${(LP.sel === c.name ? 2 : 1.2) * u}" stroke-dasharray="${2.5 * u} ${2.5 * u}" opacity=".95"/>`;
    });
    const showNames = W < 3200;
    const mlabels = [];
    mobs.slice().sort((a, b) => b.on.length - a.on.length).forEach(m => {
      if (!inV(m.x, m.y, 200)) return;
      const hot = m.on.length > 0;
      if (m.raid) { s += `<circle cx="${m.x}" cy="${m.y}" r="${9 * u}" fill="#f0c040" stroke="#000" stroke-width="${1.4 * u}"/>` + label(m.x + 12 * u, m.y + 4 * u, '♛ ' + m.n + (m.hp != null ? ' ' + m.hp + '%' : ''), 10.5, '#f0c040'); return; }
      s += `<circle cx="${m.x}" cy="${m.y}" r="${(hot ? 5 : 3.2) * u}" fill="${m.cc ? '#8a6bd8' : '#e0483c'}" stroke="${hot ? '#ffb020' : '#000'}" stroke-width="${(hot ? 2 : 0.7) * u}"/>`;
      if (hot || showNames) { if (mlabels.some(o => Math.hypot(o[0] - m.x, o[1] - m.y) < 26 * u)) return; mlabels.push([m.x, m.y]);
        s += label(m.x + 7 * u, m.y - 5 * u, m.n + (m.lvl ? ' ' + m.lvl : '') + (m.hp != null && m.hp < 100 ? ' ' + m.hp + '%' : ''), hot ? 9.5 : 8.5, hot ? '#ffb3a6' : '#e8c0b8'); }
    });
    // members (selected one last = on top)
    const order = d.members.filter(c => isFinite(c.x)).sort((a, b) => (a.name === LP.sel) - (b.name === LP.sel));
    const labels = [];
    order.forEach(c => {
      const lv = live(c), D = c.doing || {}, fight = lv && (c.combat || D.target), st = stuckOf(c), isL = c.name === d.leader, sel = LP.sel === c.name;
      const r0 = (isL ? 7.5 : 6) * u;
      const fill = c.dead ? '#3a0d0d' : !lv ? '#666' : D.resting ? '#5aa9ff' : col;
      if (sel) s += `<circle cx="${c.x}" cy="${c.y}" r="${r0 + 9 * u}" fill="rgba(255,255,255,.18)" stroke="#fff" stroke-width="${1.5 * u}"/>`;
      if (st) s += `<circle class="lp-pulse" cx="${c.x}" cy="${c.y}" r="${r0 + 6 * u}" fill="none" stroke="${st.hard ? '#e0483c' : '#ff9f43'}" stroke-width="${2.4 * u}"/>`;
      const k0 = c.cast, k = k0 && !(window.castGone && castGone(k0, srvNow(), 8000)) ? k0 : null;   // D13: no arc / ⌛ for a cast whose time ran out
      s += `<circle cx="${c.x}" cy="${c.y}" r="${r0}" fill="${fill}" stroke="${fight ? '#ff5a45' : '#fff'}" stroke-width="${(fight ? 2.4 : 1.3) * u}"/>`;
      if (lv && k && !k.ended && +k.ms > 0) s += `<circle class="lp-arc" data-start="${esc(k.start)}" data-ms="${+k.ms}" cx="${c.x}" cy="${c.y}" r="${r0 + 3.5 * u}" fill="none" stroke="#ffcf4d" stroke-width="${2.6 * u}" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 ${c.x} ${c.y})"/>`;   // cast arc AFTER the dot = drawn on top of it (user 2026-10-09 10:05)
      if (isL) s += label(c.x, c.y + 3.6 * u, '★', 9, '#fff', 'middle');
      if (c.dead) s += label(c.x, c.y + 3.6 * u, '✕', 10, '#ff6b5a', 'middle');
      const glyph = c.dead ? '' : !lv ? ' (offline)' : st ? (st.hard ? ` stuck ${st.sec != null ? st.sec + ' s' : ''}` : ` not moving ${st.sec} s`) : (k && !k.ended) ? ' ⌛' : D.resting ? ' zZ' : fight ? ' ⚔' : '';
      const own = sel || st || c.dead || (c.escape && c.escape.on);          // stuck / dead / escaping / selected members always get their own label
      const g = !own && labels.find(o => Math.hypot(o.x - c.x, o.y - c.y) < 28 * u && !o.own);
      if (g) g.names.push(c.name); else labels.push({ x: c.x, y: c.y, names: [c.name], glyph, sel, st, own });
    });
    labels.forEach(g => {
      const t = g.names.length > 2 ? g.names[0] + ' +' + (g.names.length - 1) : g.names.join(', ');
      s += label(g.x + 10 * u, g.y + 4 * u, t + (g.names.length === 1 ? g.glyph : ''), g.sel ? 12 : 10.5, g.st ? (g.st.hard ? '#ff8a7a' : '#ffc27a') : '#fff');
    });
    // scale bar (top left)
    const sm = Math.pow(10, Math.floor(Math.log10(W / 4))), sb = W / 4 > 5 * sm ? 5 * sm : W / 4 > 2 * sm ? 2 * sm : sm;
    s += `<g transform="translate(${x0 + 10 * u} ${y0 + 20 * u})"><line x1="0" y1="0" x2="${sb}" y2="0" stroke="#fff" stroke-width="${2 * u}"/>${label(0, -5 * u, km(sb), 10)}</g>`;
    return s;
  }
  function animArcs() {
    document.querySelectorAll('#lpOver .lp-arc').forEach(a => {
      const st = Date.parse(a.dataset.start), ms = +a.dataset.ms || 0;
      const p = ms && isFinite(st) ? Math.max(0, Math.min(1, (srvNow() - st) / ms)) : 1;
      a.setAttribute('stroke-dasharray', `${(p * 100).toFixed(1)} 100`);
    });
  }
  setInterval(() => { if (LP.open && !document.hidden) animArcs(); }, 150);

  // ------------------------------------------------------------------ party card button + exports ------------------------------------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-livep]'); if (!b) return;
    e.stopPropagation();
    go('#/live/' + encodeURIComponent(b.dataset.livep));
  });
  const button = (leader) => `<button class="lpbtn" data-livep="${esc(leader)}" title="Live map: what every member does right now (aggro, casts, fights, stuck, routes, selling)">Live</button>`;
  window.LiveParty = { route, open, close, xpDelta, button, _lp: LP, _activity: activity };
  // the page may already be on #/live/<leader> (opened by a link): index.html's first route() ran before this script loaded
  try { const [k, a] = location.hash.replace(/^#\/?/, '').split('/'); if (k === 'live' && a) open(decodeURIComponent(a)); } catch (e) { }
  try { if (TAB === 'parties' && STATE) renderParties(); } catch (e) { }   // the Live buttons + exp deltas at once (not only after the next 4 s refresh)
})();
