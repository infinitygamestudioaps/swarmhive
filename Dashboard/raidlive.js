// RAIDLIVE HUD (user 2026-10-09 09:30): "Whenever we go into raid LIVE watch, I want to see the skills and debuffs JUST as on mobile and iPad.
// On PC it should be even better. There is a lot of leftover space when using a computer full screen. Should be way more detailed."
// ONE data model (/api/raidlive = Logs/raid_live.json + Dashboard/raidlive_api.js) and ONE set of components for every device. The layout
// is chosen by the width of the view itself (CSS container queries in raidlive.css): phone = stacked collapsible sections, tablet = 2 columns,
// desktop = a multi-column raid HUD. Loaded by index.html after its main script; uses its globals (esc, gauge, gaugeN, skillIcon, classIcon,
// debuffCards, fmtK, mss, MT, KM_ROLE, pref/setPref, pollLive). index.html's liveHtml() / kamaLiveHtml() call window.RaidLiveHUD when present.
(function () {
  'use strict';
  const H = {
    key: '', skillHist: {}, flash: {},                 // name -> [{ skill, target, at ms }] built from the 1 s polls (until swarm.js writes party[].skills)
    R: 0, rkey: '',                          // map radius only grows during a fight (no jumping)
    closed: new Set(safePref('rlh.closed', ['dlog'])),
    feed: Object.assign({ event: true, heal: true, skill: true, boss: true }, safePref('rlh.feed', {})),
  };
  function safePref(k, d) { try { return typeof pref === 'function' ? pref(k, d) : d; } catch (e) { return d; } }
  function savePref(k, v) { try { if (typeof setPref === 'function') setPref(k, v); } catch (e) { } }

  const TANK = /^(sk|tank)$/, HEALER = /bishop|shilliensaint|elder|healer|cleric|oracle|prophet/i;
  const ROLE_TXT = { nuker: 'Nuker', mage: 'Mage', dagger: 'Dagger', archer: 'Archer', summoner: 'Summoner', crafter: 'Crafter', spoiler: 'Spoiler' };
  const roleTxt = (r) => (typeof KM_ROLE !== 'undefined' && KM_ROLE[r]) || ROLE_TXT[r] || r || '';
  const roleCol = (r) => TANK.test(r || '') ? 'var(--rm-tank)' : HEALER.test(r || '') ? 'var(--rm-heal)' : /destroyer|doombringer|inspector|dagger|archer/.test(r || '') ? 'var(--rlh-melee)' : 'var(--rlh-caster)';
  const meta = (L, id) => (L.skillMeta && L.skillMeta[id]) || null;
  const sn = (L, id) => { if (!id) return ''; const g = (GD.skills[id] || [])[0]; return g || (meta(L, id) || {}).n || ('skill ' + id); };
  const ic = (id, cls, title) => `<img class="rlh-ic ${cls || ''}" src="${skillIcon(id)}" alt="" loading="lazy"${title ? ` title="${esc(title)}"` : ''}>`;
  const secOfDay = (t) => { const m = /(\d\d):(\d\d):(\d\d)/.exec(String(t || '')); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0; };
  const hms = (ms) => new Date(ms).toTimeString().slice(0, 8);
  const pctCls = (v) => v == null ? '' : v < 30 ? 'crit' : v < 60 ? 'warn' : '';
  const isAoe = (m) => m && m.ar > 0 && /RANGE|POINT_BLANK|SQUARE|FAN|RING/.test(m.scope || '');

  /** The section frame: a <details> so phones can fold it; morphdom keeps the user's open/closed state, the choice is also remembered. */
  function sec(id, title, body, extra) {
    return `<details class="rlh-sec rlh-s-${id}" data-rlhsec="${id}"${H.closed.has(id) ? '' : ' open'}><summary><h3>${title}</h3>${extra ? `<span class="rlh-sx">${extra}</span>` : ''}</summary><div class="rlh-body">${body}</div></details>`;
  }
  document.addEventListener('toggle', (e) => {
    const d = e.target; if (!d || !d.dataset || !d.dataset.rlhsec) return;
    if (d.open) H.closed.delete(d.dataset.rlhsec); else H.closed.add(d.dataset.rlhsec);
    savePref('rlh.closed', [...H.closed]);
  }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-rlhf]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const k = b.dataset.rlhf; H.feed[k] = !H.feed[k]; savePref('rlh.feed', H.feed);
    try { if (typeof pollLive === 'function') pollLive(); } catch (er) { }
  });

  /** Keep a short per-member skill history from the polls (works with the live swarm.js before party[].skills is deployed). */
  function track(L) {
    const key = String(L.startedMs || L.startedAt || '');
    if (H.key !== key) { H.key = key; H.skillHist = {}; H.flash = {}; H.R = 0; }
    const upd = Date.parse(L.updatedAt || 0) || Date.now();
    (L.party || []).forEach(p => {
      const a = p.act; if (!a || a.kind !== 'cast' || !a.skill) return;
      const at = upd - (a.agoMs != null ? a.agoMs : (a.ago || 0) * 1000);
      const l = H.skillHist[p.name] || (H.skillHist[p.name] = []);
      const last = l[l.length - 1];
      if (last && last.skill === a.skill && Math.abs(last.at - at) < 2500) return;
      l.push({ skill: a.skill, target: a.target || '', at }); if (l.length > 12) l.shift();
    });
  }
  /** Last skills of a member, newest first: [{ skill, target, ago }]. */
  function lastSkills(L, p) {
    if (Array.isArray(p.skills) && p.skills.length) return p.skills;
    const upd = Date.parse(L.updatedAt || 0) || Date.now();
    const l = (H.skillHist[p.name] || []).slice(-5).reverse().map(c => ({ skill: c.skill, target: c.target, ago: Math.max(0, Math.round((upd - c.at) / 1000)) }));
    if (!l.length && p.st && p.st.lastSkill && p.st.lastSkill.id) l.push({ skill: p.st.lastSkill.id, target: p.st.lastSkill.tgt || '', ago: Math.max(0, Math.round((Date.now() - Date.parse(p.st.lastSkill.at)) / 1000)) });
    return l;
  }
  const secsOf = (L) => L.startedMs ? Math.max(1, Math.round(((L.endedMs || Date.parse(L.updatedAt)) - L.startedMs) / 1000)) : 0;

  // ---------------------------------------------------------------------------------------------- boss panel
  function spark(hist, secs) {
    if (!hist || hist.length < 2) return '<div class="rlh-spark muted">HP line: collecting…</div>';
    const W = 300, Hh = 60, maxS = Math.max(secs || 0, hist[hist.length - 1][0], 10);
    const pts = hist.map(([s, hp]) => `${(W * s / maxS).toFixed(1)},${(Hh - Hh * Math.max(0, Math.min(100, hp)) / 100).toFixed(1)}`);
    const last = hist[hist.length - 1];
    const grid = [25, 50, 75].map(v => `<line x1="0" x2="${W}" y1="${Hh - Hh * v / 100}" y2="${Hh - Hh * v / 100}" class="g"/>`).join('');
    return `<svg class="rlh-spark" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" aria-label="boss HP over time">${grid}` +
      `<polygon class="a" points="0,${Hh} ${pts.join(' ')} ${(W * last[0] / maxS).toFixed(1)},${Hh}"/><polyline class="l" points="${pts.join(' ')}"/>` +
      `<circle class="d" cx="${(W * last[0] / maxS).toFixed(1)}" cy="${(Hh - Hh * last[1] / 100).toFixed(1)}" r="2.5"/></svg>`;
  }
  /** Time to kill from the HP line: the slope of the last 60 s (or the whole fight when shorter). */
  function ttk(hist, hp) {
    if (!hist || hist.length < 2 || hp == null) return null;
    const last = hist[hist.length - 1];
    const from = hist.find(h => h[0] >= last[0] - 60) || hist[0];
    const dt = last[0] - from[0], dh = from[1] - last[1];
    if (dt < 6 || dh <= 0) return null;
    return Math.round(hp / (dh / dt));
  }
  function bossPanel(L) {
    const b = L.boss || {}, secs = secsOf(L);
    const hist = L.hpHist || [];
    const t = ttk(hist, b.hp);
    const tgt = L.bossTarget || '';
    const tgtP = (L.party || []).find(p => p.name === tgt);
    const tankOk = tgtP && TANK.test(tgtP.role || '');
    const cm = b.cast ? meta(L, b.cast) : null;
    const castNow = b.cast ? `<span class="rlh-bcast">${ic(b.cast, 'sm')}casting <b>${esc(sn(L, b.cast))}</b>${cm && isAoe(cm) ? ` <span class="chip bad">AoE ${cm.ar}</span>` : ''}</span>` : '<span class="muted">not casting</span>';
    const dealt = (L.totals && L.totals.dealt) || 0;
    const casts = (L.bossCasts || []).slice(0, 8).map(c => `<div class="rlh-bc"><span class="t">${esc(c.t)}</span>${ic(c.skill, 'sm')}<span class="n">${esc(sn(L, c.skill))}</span>${c.target ? `<span class="agg">→ ${esc(c.target)}</span>` : ''}</div>`).join('');
    const st = (L.bossState || []).map(x => `<span class="chip bad">${esc(x)}</span>`).join(' ');
    return `<div class="rlh-boss ${b.objId && b.objId === L.focus ? 'focus' : ''}">
      <div class="rlh-bmain">
        <div class="rlh-bname"><b>${esc(b.name || 'boss')}</b> ${st}</div>
        ${gaugeN('hp big', b.hp)}
        ${spark(hist, secs)}
      </div>
      <div class="rlh-bstats">
        <div><span class="k">On the boss</span><span class="v">${secs ? mss(secs) : '—'}</span></div>
        <div><span class="k">Kill in ≈</span><span class="v">${t != null ? mss(t) : '—'}</span></div>
        <div><span class="k">Party DPS</span><span class="v">${secs && dealt ? fmtK(dealt / secs) : '—'}</span></div>
        <div class="wide"><span class="k">Aggro on</span><span class="v">${tgt ? `<span class="${tankOk ? 'ok' : 'agg'}">${esc(tgt)}</span> <span class="muted">${tankOk ? 'tank ✓' : tgtP ? 'NOT the tank' : ''}${L.bossTargetSrc === 'attack' ? ' · from its hits' : ''}</span>` : '<span class="muted">nobody (idle)</span>'}</span></div>
        <div class="wide"><span class="k">Boss now</span><span class="v">${castNow}</span></div>
      </div>
      ${casts ? `<div class="rlh-bcasts"><div class="muted">Boss skills (newest first)</div>${casts}</div>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------------------------------------- debuffs on the boss
  function debuffPanel(L) {
    const b = L.boss || {};
    const cards = typeof debuffCards === 'function' ? debuffCards(L.debuffs) : '';
    // every debuff-type cast at the boss this fight (from the members' skill history), also the ones that ran out
    const tried = [];
    (L.party || []).forEach(p => lastSkills(L, p).forEach(c => { const m = meta(L, c.skill); if (m && m.deb && c.target === b.name && !/Aggression|Hate|Provoke|Challenge/i.test(m.n || '')) tried.push({ p: p.name, c }); }));
    const counts = {}; (L.party || []).forEach(p => Object.entries(p.casts || {}).forEach(([id, n]) => { const m = meta(L, id); if (m && m.deb && !/Aggression|Hate|Provoke|Challenge/i.test(m.n || '')) (counts[p.name] = counts[p.name] || []).push(`${esc(m.n)} ×${n}`); }));
    const hist = Object.keys(counts).length ? `<div class="rlh-dbhist muted">Debuff casts this fight: ${Object.entries(counts).map(([n, l]) => `<b>${esc(n)}</b> ${l.join(', ')}`).join(' · ')}</div>`
      : tried.length ? `<div class="rlh-dbhist muted">Recent debuff casts: ${tried.map(x => `${ic(x.c.skill, 'xs')}${esc(sn(L, x.c.skill))} <b>${esc(x.p)}</b> ${x.c.ago}s ago`).join(' · ')}</div>` : '';
    const note = (L.debuffs || []).length ? '' : `<div class="muted rlh-dbnote">Nobody in this party has put a debuff on the boss${secsOf(L) > 30 ? ' this fight' : ' yet'}. Debuffs are reported by the caster (the server does not send a boss's effects).</div>`;
    return `<div class="dbf-grid">${cards}</div>${hist}${note}`;
  }

  // ---------------------------------------------------------------------------------------------- minions + other monsters
  function minionPanel(L) {
    const mins = L.minions || [], alive = mins.filter(m => !m.dead);
    const deadN = {}; mins.forEach(m => { if (m.dead) deadN[m.name] = (deadN[m.name] || 0) + 1; });
    const isF = (m) => m.focus || (m.objId && m.objId === L.focus);
    const tg = (m) => m.act && m.act.target ? `<span class="agg">→ ${esc(m.act.target)}</span>` : '<span class="muted">idle</span>';
    const row = (m, oth) => `<div class="rlh-mob ${isF(m) ? 'focus' : ''} ${oth ? 'oth' : ''}"><span class="nm">${isF(m) ? '▶ ' : ''}${esc(m.name)}</span>${gaugeN('hp', m.hp)}<span class="tx">${tg(m)}${m.cast ? ` <span class="cast">${ic(m.cast, 'xs')}${esc(sn(L, m.cast))}</span>` : ''}</span></div>`;
    const dead = Object.entries(deadN).map(([n, c]) => `<span class="rlh-dead">✕ ${esc(n)}${c > 1 ? ' ×' + c : ''}</span>`).join('');
    const oth = (L.others || []).map(m => row(m, true)).join('');
    return `${alive.map(m => row(m)).join('') || '<div class="muted">no minion alive</div>'}${dead ? `<div class="rlh-deadl">${dead}</div>` : ''}${oth ? `<div class="rlh-sub">Other monsters on us</div>${oth}` : ''}`;
  }

  // ---------------------------------------------------------------------------------------------- the map
  function place(placed, x, y, w, h) {
    const C = [[0, 0], [0, -1], [1, 0], [-1, 0], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [0, -2], [0, 2], [2, 0], [-2, 0]];
    for (const [dx, dy] of C) {
      const cx = x + dx * w * 0.6, cy = y + dy * h * 1.05;
      const r = { x1: cx - w / 2, x2: cx + w / 2, y1: cy - h, y2: cy };
      if (!placed.some(p => r.x1 < p.x2 && r.x2 > p.x1 && r.y1 < p.y2 && r.y2 > p.y1)) { placed.push(r); return { x: cx, y: cy }; }
    }
    return null;
  }
  /** the raid fight area for the map: the leader's own (L.area, swarm.js RAIDAREA) or the saved one (L.raidArea, raidlive_api.js) */
  function raArea(L) { const a = (L.area && Array.isArray(L.area.fight) && L.area.fight.length >= 3) ? L.area : (L.raidArea && Array.isArray(L.raidArea.fight) && L.raidArea.fight.length >= 3 ? L.raidArea : null); return a; }
  function mapHtml(L, opt) {
    opt = opt || {};
    const b = L.boss || {};
    const party = L.party || [];
    const mobs = [b].concat((L.minions || []).filter(m => !m.dead), L.others || []).filter(m => m && m.x != null);
    const pts = mobs.concat(party.filter(p => p.x != null));
    if (!pts.length) return '<div class="muted">no positions yet</div>';
    const cx = b.x != null ? b.x : pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = b.y != null ? b.y : pts.reduce((a, p) => a + p.y, 0) / pts.length;
    let R = 1000; pts.forEach(p => { R = Math.max(R, Math.abs(p.x - cx) + 250, Math.abs(p.y - cy) + 250); });
    const A = raArea(L);   // RAID FIGHT AREA 2026-10-09: the map shows the whole fight area + stage
    if (A) A.fight.concat(Array.isArray(A.stage) ? [A.stage] : []).forEach(p => { R = Math.max(R, Math.abs(p[0] - cx) + 250, Math.abs(p[1] - cy) + 250); });
    H.R = Math.max(H.R, Math.min(R, 6000)); R = H.R;
    const fs = R / 17, r0 = R / 40, sw = R / 260;
    const rel = (p) => ({ x: Math.round(p.x - cx), y: Math.round(p.y - cy) });
    // map pieces (same tiles as the old raid map / party map)
    let tiles = '';
    try {
      const LAY = window.MAP_LAYERS || {}, z = b.z;
      const layer = (rx, ry) => (z != null && z < -4500 && LAY[rx + '_' + ry]) ? '_L1' : '';
      for (let gx = Math.floor((cx - R) / MT); gx * MT < cx + R; gx++) for (let gy = Math.floor((cy - R) / MT); gy * MT < cy + R; gy++) {
        const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, cc = gx - Math.floor(gx / 4) * 4, rr = gy - Math.floor(gy / 4) * 4;
        tiles += `<image href="/minitile/${RX}_${RY}${layer(RX, RY)}_${cc}_${rr}.jpg" x="${gx * MT - cx}" y="${gy * MT - cy}" width="${MT}" height="${MT}" preserveAspectRatio="none"/>`;
      }
    } catch (e) { }
    // RAID FIGHT AREA (2026-10-09): fight area (orange), clear area (yellow dashed; automatic = fight area + margin), stage flag, monsters left to clear
    let areaSvg = '';
    if (A) {
      const PP = (Q) => Q.map(p => `${Math.round(p[0] - cx)},${Math.round(p[1] - cy)}`).join(' ');
      if (Array.isArray(A.clear) && A.clear.length >= 3) areaSvg += `<polygon class="ra-clear" points="${PP(A.clear)}" style="stroke-width:${(sw * 2).toFixed(1)}px"><title>clear area</title></polygon>`;
      else if (A.clearMargin > 0) areaSvg += `<g class="ra-auto"><polygon points="${PP(A.fight)}" style="stroke-width:${2 * A.clearMargin}px"/></g>`;
      areaSvg += `<polygon class="ra-fight" points="${PP(A.fight)}" style="stroke-width:${(sw * 2.5).toFixed(1)}px"><title>fight area</title></polygon>`;
      if (Array.isArray(A.stage)) { const q = { x: Math.round(A.stage[0] - cx), y: Math.round(A.stage[1] - cy) }; areaSvg += `<g class="ra-stage" style="transform:translate(${q.x}px,${q.y}px)"><path d="M0 0 V${(-r0 * 3).toFixed(0)} h${(r0 * 2.2).toFixed(0)} l${(-r0 * 0.6).toFixed(0)} ${(r0 * 0.75).toFixed(0)} l${(r0 * 0.6).toFixed(0)} ${(r0 * 0.75).toFixed(0)} h${(-r0 * 2.2).toFixed(0)}z" style="stroke-width:${(sw * 1.5).toFixed(1)}px"/><title>stage (the team waits here during the clear)</title></g>`; }
    }
    ((L.area && L.area.left) || []).forEach(m => { if (m.x == null) return; areaSvg += `<circle class="ra-left ${m.aggr ? 'aggr' : ''}" cx="${Math.round(m.x - cx)}" cy="${Math.round(m.y - cy)}" r="${(r0 * 0.8).toFixed(0)}" style="stroke-width:${(sw * 2).toFixed(1)}px"><title>${esc(m.name)} — still to clear</title></circle>`; });   // monsters still to clear (also without a fight area)
    const pos = {}; party.forEach(p => { if (p.x != null) pos[p.name] = rel(p); });
    const mobBy = {}; mobs.forEach(m => { if (!mobBy[m.name]) mobBy[m.name] = rel(m); });
    const at = (name) => pos[name] || mobBy[name] || null;
    const ageMs = (L.ageSec || 0) * 1000;
    let lines = '', aoe = '';
    const ln = (cls, a, c, id) => { if (a && c) lines += `<line ${id ? `id="rlh-l-${esc(id)}"` : ''} class="${cls}" x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" style="stroke-width:${(cls === 'agg' ? sw * 3 : sw * 2).toFixed(1)}px"/>`; };
    // monsters -> who they hit (aggro)
    mobs.forEach(m => { if (m.act && m.act.target && pos[m.act.target]) ln('agg', rel(m), pos[m.act.target], 'a' + (m.objId || m.name)); });
    // our attacks / casts: solid thin = melee hit, dashed = cast (green heal, purple debuff, orange damage); AoE circle where it lands
    party.forEach(p => {
      if (p.dead || !p.act || !pos[p.name]) return;
      const a = p.act, m = a.kind === 'cast' ? meta(L, a.skill) : null, t = at(a.target);
      const cls = a.kind === 'hit' ? 'hit' : pos[a.target] ? 'heal' : m && m.deb ? 'deb' : 'nuke';
      if (t) ln(cls, pos[p.name], t, 'p' + p.name);
      const el = (a.agoMs != null ? a.agoMs : (a.ago || 0) * 1000) + ageMs;
      if (m && isAoe(m) && el < (m.hit || 1000) + 2500) {
        const c = /POINT_BLANK|SQUARE_PB/.test(m.scope) ? pos[p.name] : (t || pos[p.name]);
        aoe += `<circle class="aoe ${cls}" cx="${c.x}" cy="${c.y}" r="${m.ar}" style="stroke-width:${sw * 2}px"><title>${esc(p.name)}: ${esc(m.n)} (radius ${m.ar})</title></circle>`;
      }
    });
    if (b.cast && b.x != null) { const m = meta(L, b.cast); if (isAoe(m)) { const c = /POINT_BLANK|SQUARE_PB/.test(m.scope) ? rel(b) : (at(L.bossTarget) || rel(b)); aoe += `<circle class="aoe boss" cx="${c.x}" cy="${c.y}" r="${m.ar}" style="stroke-width:${sw * 3}px"><title>boss: ${esc(m.n)}</title></circle>`; } }
    // units + labels (collision-avoiding; members carry their number, the full names are in the legend)
    const placed = [];
    const block = (p, r) => placed.push({ x1: p.x - r, x2: p.x + r, y1: p.y - r, y2: p.y + r });
    let units = '', labels = '';
    if (b.x != null) block({ x: 0, y: 0 }, r0 * 2.6);
    party.forEach(p => { if (pos[p.name]) block(pos[p.name], r0 * 1.1); });
    (L.minions || []).filter(m => !m.dead && m.x != null).forEach(m => {
      const q = rel(m), foc = m.focus || (m.objId && m.objId === L.focus);
      block(q, r0 * 1.2);
      units += `<g id="rlh-m${m.objId}" class="u" style="transform:translate(${q.x}px,${q.y}px)">${foc ? `<circle r="${(r0 * 2).toFixed(0)}" class="foc" style="stroke-width:${sw * 3}px"/>` : ''}<circle r="${(r0 * 1.2).toFixed(0)}" class="min" style="stroke-width:${sw * 1.5}px"/></g>`;
      const txt = (m.hp != null ? m.hp + '% ' : '') + String(m.name).replace(/ of .*$/, '').slice(0, 12);
      const lp = place(placed, q.x, q.y - r0 * 1.4, txt.length * fs * 0.5, fs * 0.8);
      if (lp) labels += `<text x="${lp.x.toFixed(0)}" y="${lp.y.toFixed(0)}" font-size="${(fs * 0.75).toFixed(0)}" class="ml">${esc(txt)}</text>`;
    });
    (L.others || []).forEach(m => { if (m.x == null) return; const q = rel(m); units += `<g class="u" style="transform:translate(${q.x}px,${q.y}px)"><circle r="${r0.toFixed(0)}" class="oth" style="stroke-width:${sw * 1.5}px"><title>${esc(m.name)}</title></circle></g>`; });
    party.forEach((p, i) => {
      const q = pos[p.name]; if (!q) return;
      const hpc = !p.dead && p.hp != null && p.hp < 30 ? '#ff2a2a' : !p.dead && p.hp != null && p.hp < 60 ? '#ffa020' : '#000';
      units += `<g id="rlh-p${esc(p.name)}" class="u ${p.dead ? 'dead' : ''}" style="transform:translate(${q.x}px,${q.y}px)"><circle r="${r0.toFixed(0)}" style="fill:${p.dead ? 'var(--rm-dead)' : roleCol(p.role)};stroke:${hpc};stroke-width:${(hpc === '#000' ? sw * 1.5 : sw * 4).toFixed(1)}px"/>` +
        `<text y="${(r0 * 0.38).toFixed(0)}" font-size="${(r0 * 1.15).toFixed(0)}" class="num">${p.dead ? '✝' : i + 1}</text><title>${i + 1}. ${esc(p.name)} ${p.hp != null ? p.hp + '%' : ''}</title></g>`;
      if (!opt.noNames) { const txt = String(p.name).slice(0, 10), lp = place(placed, q.x, q.y + r0 + fs * 0.85, txt.length * fs * 0.5, fs * 0.8); if (lp) labels += `<text x="${lp.x.toFixed(0)}" y="${lp.y.toFixed(0)}" font-size="${(fs * 0.72).toFixed(0)}" class="pl ${p.dead ? 'dead' : ''}">${esc(txt)}</text>`; }
    });
    if (b.x != null) {
      const hp = Math.max(0, Math.min(100, +b.hp || 0)), br = r0 * 2.3, circ = 2 * Math.PI * br;
      units += `<g id="rlh-b" class="u"><circle r="${br.toFixed(0)}" class="bossbg" style="stroke-width:${sw * 6}px"/><circle r="${br.toFixed(0)}" class="bosshp" style="stroke-width:${sw * 6}px" stroke-dasharray="${(circ * hp / 100).toFixed(0)} ${circ.toFixed(0)}" transform="rotate(-90)"/><circle r="${(br - r0 * 0.5).toFixed(0)}" class="boss" style="stroke-width:${sw * 1.5}px"/><text y="${(fs * 0.35).toFixed(0)}" font-size="${fs.toFixed(0)}" class="bt">${b.hp != null ? Math.round(hp) + '%' : '?'}</text></g>`;
    }
    // scale bar: 500 game units
    const sb = `<g class="scale"><line x1="${(-R + R * 0.06).toFixed(0)}" x2="${(-R + R * 0.06 + 500).toFixed(0)}" y1="${(R - R * 0.06).toFixed(0)}" y2="${(R - R * 0.06).toFixed(0)}" style="stroke-width:${sw * 3}px"/><text x="${(-R + R * 0.06 + 250).toFixed(0)}" y="${(R - R * 0.06 - fs * 0.4).toFixed(0)}" font-size="${(fs * 0.6).toFixed(0)}">500</text></g>`;
    const svg = `<svg class="rmap2 rlh-map" viewBox="${-R} ${-R} ${2 * R} ${2 * R}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="raid map"><rect x="${-R}" y="${-R}" width="${2 * R}" height="${2 * R}" class="bg"/><g class="tiles">${tiles}</g><rect x="${-R}" y="${-R}" width="${2 * R}" height="${2 * R}" class="dim"/>${areaSvg}<g class="aoes">${aoe}</g><g>${lines}</g>${units}<g class="lbl">${labels}</g>${sb}</svg>`;
    const legend = party.map((p, i) => `<span class="rlh-lg ${p.dead ? 'dead' : ''}"><i style="background:${p.dead ? 'var(--rm-dead)' : roleCol(p.role)}">${i + 1}</i>${esc(p.name)}</span>`).join('');
    const keys = `<div class="rlh-keys"><span><i class="lk agg"></i>monster hits</span><span><i class="lk hit"></i>we hit</span><span><i class="lk nuke"></i>damage spell</span><span><i class="lk deb"></i>debuff</span><span><i class="lk heal"></i>heal / buff</span><span><i class="ck"></i>AoE</span><span><i class="dot min"></i>minion</span><span><i class="dot oth"></i>other</span>${A ? '<span><i class="lk ra-f"></i>fight area</span><span><i class="lk ra-c"></i>clear area</span><span><i class="lk ra-s"></i>stage</span>' : ''}</div>`;
    return `${svg}<div class="rlh-legend">${legend}</div>${keys}`;
  }

  // ---------------------------------------------------------------------------------------------- team
  // TEAM CARDS (user 2026-10-09 09:45: "the × 3.222 causes the formation of HP and mana to be bumped ... make it look really nice with
  // animations, cooldowns like the mobile version but even better"): every card has the SAME rows in the same place —
  //   1 header (number, class icon, name + class, fixed slots: shots | DMG)   2 HP / MP / CP bars (always 3 slots)
  //   3 doing now (fixed height, ellipsis; cast icon with a progress ring)     4 key skills with cooldown sweeps (like the game's skill bar)
  //   5 buffs / debuffs (one line)   6 role line (one line)   7 damage-share bar (animated)
  // The old "⚔ 2.8k" (damage dealt this fight, which rendered as "× 2.847" on Windows) is now the labelled DMG slot.
  const POT = /potion|elixir|nectar|healing drug/i;
  /** HP flash bookkeeping: damage taken / heal received since the last poll -> a short flash (class name alternates to restart it). */
  function flashOf(p) {
    const f = H.flash[p.name] || (H.flash[p.name] = { hp: p.hp, n: 0, kind: '', until: 0 });
    if (p.hp != null && f.hp != null && !p.dead) {
      if (p.hp <= f.hp - 3) Object.assign(f, { kind: 'dmg', n: f.n + 1, until: Date.now() + 1100 });
      else if (p.hp >= f.hp + 3) Object.assign(f, { kind: 'heal', n: f.n + 1, until: Date.now() + 1100 });
    }
    f.hp = p.hp;
    return Date.now() < f.until ? ` fx-${f.kind}-${f.n % 2}` : '';
  }
  /** Last cast time of each skill this member used (ms), from the history the view keeps + the writer's list. */
  function lastCastAt(L, p) {
    const upd = Date.parse(L.updatedAt || 0) || Date.now(), out = {};
    (H.skillHist[p.name] || []).forEach(c => { out[c.skill] = Math.max(out[c.skill] || 0, c.at); });
    (p.skills || []).forEach(c => { const at = upd - (c.ago || 0) * 1000; if (!out[c.skill] || at > out[c.skill] + 2500) out[c.skill] = at; });
    return out;
  }
  /** Key skills: the member's most used skills this fight (casts per skill), else the last ones seen; potions and shots left out. */
  function keySkills(L, p) {
    const ids = [];
    Object.entries(p.casts || {}).sort((a, b) => b[1] - a[1]).forEach(([id]) => ids.push(+id));
    lastSkills(L, p).forEach(c => ids.push(+c.skill));
    (H.skillHist[p.name] || []).slice().reverse().forEach(c => ids.push(+c.skill));
    return [...new Set(ids)].filter(id => id && !POT.test(sn(L, id))).slice(0, 6);
  }
  function cdSlot(L, p, id, lastAt, n) {
    const m = meta(L, id) || {}, reuse = +m.reuse || 0, hit = +m.hit || 0;
    const pcNow = (Date.parse(L.updatedAt || 0) || Date.now()) + (L.ageSec || 0) * 1000;   // 'now' on the PC's clock (lastAt is on it too)
    let el = lastAt ? pcNow - lastAt : Infinity;
    let total = reuse + hit;
    const ovs = p.st && p.st.ov && (p.st.ov.skills || []).find(s => +s.id === +id);   // the member's own reuse timer (swarm_state.ov) wins over the estimate
    if (ovs) { const remain = (+ovs.cd || 0) - ((p.st.ageSec || 0) + (L.ageSec || 0)) * 1000; if (remain > 0) { total = Math.max(total, +ovs.cd || 0); el = total - remain; } else if (ovs.ready) el = Infinity; }
    const on = total > 0 && el < total;
    const left = on ? Math.ceil((total - el) / 1000) : 0;
    const style = on ? ` data-t0="${Math.round((Date.now() - el) / 250) * 250}" data-dur="${total}" data-cd="1" style="--p:${Math.round(100 * (total - el) / total)}%"` : '';   // the ticker below keeps it moving between refreshes
    return `<span class="rlh-cd ${on ? 'on' : ''}" title="${esc(sn(L, id))}${n ? ' · cast ×' + n : ''}${reuse ? ' · reuse ' + (reuse / 1000).toFixed(reuse < 10000 ? 1 : 0) + ' s' : ''}${on ? ' · ready in ' + left + ' s' : ' · ready'}">` +
      `<img src="${skillIcon(id)}" alt="" loading="lazy"><i class="sw"${style}></i>${on ? `<b class="cdn">${left}</b>` : ''}${n ? `<em>${n}</em>` : ''}</span>`;
  }
  /** Cast rings + cooldown sweeps move smoothly between the 1 s refreshes: every 100 ms --p = % done (cast) / % still to wait (cooldown).
   *  The start time is in the element (data-t0, this browser's clock), so a refresh never restarts or skips it. */
  setInterval(() => {
    if (document.hidden) return;
    const now = Date.now();
    document.querySelectorAll('.rlh [data-t0][data-dur], .rlh-s-kteam [data-t0][data-dur]').forEach(e => {
      const dur = +e.dataset.dur || 1, el = now - (+e.dataset.t0 || now), cd = e.dataset.cd === '1';
      const p = Math.max(0, Math.min(100, cd ? 100 * (dur - el) / dur : 100 * el / dur));
      e.style.setProperty('--p', p.toFixed(1) + '%');
      if (cd) { const b = e.parentNode && e.parentNode.querySelector('.cdn'); if (b) b.textContent = p > 0 ? String(Math.ceil((dur - el) / 1000)) : ''; }
    });
  }, 100);
  function memberCard(L, p, i, ctx) {
    const st = p.st || {};
    const ageMs = (L.ageSec || 0) * 1000;
    // 3. doing now (fixed height)
    let now = '<span class="muted">—</span>', castIc = '<span class="rlh-ci idle"></span>';
    if (p.dead) { now = '<b class="bad">✝ dead</b>'; castIc = '<span class="rlh-ci dead">✝</span>'; }
    else if (p.act && p.act.kind === 'cast') {
      const m = meta(L, p.act.skill) || {}, hit = +m.hit || 0;
      const el = (p.act.agoMs != null ? p.act.agoMs : (p.act.ago || 0) * 1000) + ageMs;
      const casting = hit > 0 && el < hit;
      castIc = `<span class="rlh-ci ${casting ? 'casting' : ''}"${casting ? ` data-t0="${Math.round((Date.now() - el) / 250) * 250}" data-dur="${hit}" style="--p:${Math.round(100 * el / hit)}%"` : ''}><img src="${skillIcon(p.act.skill)}" alt=""></span>`;
      now = `<b>${esc(sn(L, p.act.skill))}</b>${p.act.target ? ` <span class="${ctx.pos[p.act.target] ? 'ok' : 'tg'}">→ ${esc(p.act.target)}</span>` : ''}${casting ? ` <span class="muted">${((hit - el) / 1000).toFixed(1)} s</span>` : ''}`;
    } else if (p.act && p.act.kind === 'hit') { castIc = '<span class="rlh-ci melee">⚔</span>'; now = `hits <b>${esc(p.act.target || '')}</b>`; }
    else if (st.cast && !st.cast.ended) { castIc = `<span class="rlh-ci casting"><img src="${skillIcon(st.cast.skill || st.cast.id)}" alt=""></span>`; now = `<b>${esc(st.cast.name || sn(L, st.cast.skill))}</b> <span class="muted">${esc(st.cast.target || '')}</span>`; }
    const ag = ctx.onMe[p.name] || [];
    if (ag.length && !p.dead) now += ` <span class="agg">◀ ${ag.length > 2 ? ag.length + ' monsters' : esc(ag.join(', '))}</span>`;
    // 4. key skills + cooldowns
    const last = lastCastAt(L, p);
    const keys = keySkills(L, p).map(id => cdSlot(L, p, id, last[id], (p.casts || {})[id])).join('');
    // 5. buffs / debuffs (one line)
    const bl = st.buffList || null, debs = (p.deb || st.deb || []);
    let buffs = '';
    if (bl && bl.length) {
      const good = bl.filter(b => !b.deb), bad = bl.filter(b => b.deb);
      buffs = bad.map(b => `<img class="rlh-ic xs debf" src="${skillIcon(b.id)}" alt="" title="debuff ${esc(sn(L, b.id))} ${b.left}s">`).join('') +
        good.map(b => `<img class="rlh-ic xs" src="${skillIcon(b.id)}" alt="" title="${esc(sn(L, b.id))} ${Math.round(b.left / 60)} min">`).join('');
      buffs = `<span class="bfi">${buffs}</span><span class="bfn muted">${good.length}${bad.length ? ' · ' + bad.length + ' deb' : ''}</span>`;
    } else {
      buffs = `<span class="bfi">${debs.map(t => L.abnIcon && L.abnIcon[t] ? `<img class="rlh-ic xs debf" src="${skillIcon(L.abnIcon[t])}" alt="" title="debuff: ${esc(t)}">` : `<span class="chip bad">${esc(String(t).toLowerCase().replace(/_/g, ' '))}</span>`).join('')}` +
        `${st.buffs != null ? `<span class="chip ${st.buffs >= 10 ? 'ok' : 'bad'}" title="buffs with more than 5 min left">${st.buffs} buffs${st.buffLeft ? ' · ' + Math.round(st.buffLeft / 60) + ' min' : ''}</span>` : '<span class="muted">buffs ?</span>'}</span>`;
    }
    // 6. role line
    let role = '';
    const casts = Object.entries(p.casts || {}).map(([id, n]) => ({ id: +id, n, nm: sn(L, +id) })).sort((a, b) => b.n - a.n);
    if (TANK.test(p.role || '')) {
      const has = L.bossTarget === p.name;
      role = `<span class="${has ? 'ok' : 'agg'}">${has ? '✓ holds the boss' : L.bossTarget ? '✗ boss is on ' + esc(L.bossTarget) : 'boss idle'}</span> · ${ag.length} on him${ctx.ud[p.name] ? ` · Ultimate Defense ×${ctx.ud[p.name]}` : ''}`;
    } else if (/destroyer/.test(p.role || '')) {
      role = p.draining ? '<span class="warn">↓ draining HP for Frenzy</span>' : p.frenzy ? '<span class="ok">Frenzy / Zealot up</span>' : '<span class="muted">Frenzy not up</span>';
    } else if (HEALER.test(p.role || '')) {
      const hs = (L.heals || []).filter(h => h.healer === p.name), lh = hs[hs.length - 1];
      role = lh ? `<b>${hs.length}</b> heals · last ${esc(lh.skill)} → ${esc(lh.target)}${lh.hp != null ? ` at ${lh.hp}%` : ''} <span class="muted">${esc(lh.t)}</span>` : '<span class="muted">no heal yet this fight</span>';
    } else if (/doomcryer/.test(p.role || '')) {
      const ch = casts.filter(c => /chant|victory|magnus|war cry|battle roar/i.test(c.nm));
      const lc = lastSkills(L, p).find(c => /chant|victory|magnus/i.test(sn(L, c.skill)));
      role = ch.length ? 'chants: ' + ch.map(c => `${esc(c.nm)} ×${c.n}`).join(', ') : lc ? `last chant ${esc(sn(L, lc.skill))} ${lc.ago}s ago` : '<span class="muted">no chant seen this fight</span>';
    }
    if (!role) role = casts.length ? casts.slice(0, 3).map(c => `${esc(c.nm)} ×${c.n}`).join(', ') : `<span class="muted">${esc(roleTxt(p.role))}</span>`;
    if (ctx.died[p.name] || ctx.res[p.name]) role = `${ctx.died[p.name] ? `<span class="bad">✝ died ×${ctx.died[p.name]}</span> ` : ''}${ctx.res[p.name] ? `<span class="ok">res ×${ctx.res[p.name]}</span> · ` : ''}` + role;
    // 7. damage share
    const secs = secsOf(L), dealt = (p.dmg && p.dmg.dealt) || 0, share = ctx.top ? Math.round(100 * dealt / ctx.top) : 0;
    const shots = !p.shots ? '<span class="rlh-slot unk" title="no shot info">shots ?</span>'
      : `<span class="rlh-slot ${p.shots.on && p.shots.n > 0 ? 'ok' : 'bad'}" title="soul/spiritshots: ${p.shots.n} in the bag, auto-use ${p.shots.on ? 'ON' : 'OFF'}">${p.shots.on && p.shots.n > 0 ? '●' : '○'} SS ${fmtK(p.shots.n || 0)}</span>`;
    const dslot = `<span class="rlh-slot dmg" title="damage dealt this fight${p.dmg ? ` (${(p.dmg.hits || 0)} hits, ${p.dmg.crits || 0} crits, max ${fmtK(p.dmg.max || 0)}; taken ${fmtK(p.dmg.taken || 0)})` : ''}">DMG ${p.dmg ? fmtK(dealt) : '—'}</span>`;
    const cp = p.cp != null ? p.cp : st.cp;
    const aggro = !p.dead && L.bossTarget === p.name;
    return `<div class="rlh-mem ${p.dead ? 'dead' : ''} ${pctCls(p.hp)}${aggro ? ' aggro' : ''}${flashOf(p)}" data-mem="${esc(p.name)}">
      <div class="r1"><span class="num" style="background:${p.dead ? 'var(--rm-dead)' : roleCol(p.role)}">${i + 1}</span>${typeof classIcon === 'function' ? classIcon({ name: p.name, role: p.role, classId: st.classId, cls: st.cls }) : ''}
        <span class="rlh-who"><b>${esc(p.name)}</b><span class="muted">${st.level ? 'Lv ' + st.level + ' ' : ''}${esc(st.cls || roleTxt(p.role))}</span></span><span class="rlh-slots">${shots}${dslot}</span><button type="button" class="rlh-act" data-rlhovopen="${esc(p.name)}" title="Override: make ${esc(p.name)} cast a skill, use a potion, target, move or res once" aria-label="actions for ${esc(p.name)}">Act</button></div>
      <div class="r2">${p.dead ? gauge('hp', 0, 'dead') : gaugeN('hp', p.hp)}${gaugeN('mp', p.mp)}${cp != null ? gauge('cp', cp, cp + '%') : '<div class="gauge cp unk"><i style="width:0%"></i><span>CP ?</span></div>'}</div>
      <div class="r3">${castIc}<span class="txt">${now}</span></div>
      <div class="r4">${keys || '<span class="muted">no skill seen yet</span>'}</div>
      <div class="r5">${buffs}</div>
      <div class="r6">${role}</div>
      <div class="r7"><span class="bar"><i style="width:${share}%"></i></span><span class="v">${p.dmg ? fmtK(dealt) + (secs ? ' · ' + fmtK(dealt / secs) + '/s' : '') : 'no damage'}</span></div>
    </div>`;
  }
  function teamCtx(L, monsters) {
    const onMe = {}; (monsters || []).forEach(m => { if (m && !m.dead && m.act && m.act.target) (onMe[m.act.target] = onMe[m.act.target] || []).push(m.name); });
    const died = {}, res = {}, ud = {};
    (L.events || []).forEach(e => { const s = String(e.msg || ''); let m;
      if ((m = /^DIED:\s*(\S+)/.exec(s))) died[m[1]] = (died[m[1]] || 0) + 1;
      if ((m = /^back up:\s*(\S+)/.exec(s))) res[m[1]] = (res[m[1]] || 0) + 1;
      if ((m = /^(\S+): Ultimate Defense/.exec(s))) ud[m[1]] = (ud[m[1]] || 0) + 1; });
    const pos = {}; (L.party || []).forEach(p => { pos[p.name] = 1; });
    const top = Math.max(0, ...(L.party || []).map(p => (p.dmg && p.dmg.dealt) || 0));
    return { onMe, died, res, ud, pos, top };
  }
  function teamGrid(L, monsters) {
    const ctx = teamCtx(L, monsters);
    return `<div class="rlh-team">${(L.party || []).map((p, i) => memberCard(L, p, i, ctx)).join('')}</div>`;
  }

  // ---------------------------------------------------------------------------------------------- event feed
  function feed(L) {
    const upd = Date.parse(L.updatedAt || 0) || Date.now();
    const rows = [];
    (L.events || []).forEach(e => {
      const s = String(e.msg || ''), cls = /^DIED/.test(s) ? 'death' : /^back up/.test(s) ? 'res' : /RESULT|BOSS DOWN/.test(s) ? 'result' : /minion down|killed/.test(s) ? 'kill' : /RESISTED|interrupted/.test(s) ? 'warn' : 'event';
      rows.push({ k: 'event', t: String(e.t || '').slice(-8), cls, html: esc(s) });
    });
    (L.heals || []).forEach(h => rows.push({ k: 'heal', t: h.t, cls: 'heal', html: `${ic(h.skillId, 'xs')}<b>${esc(h.healer)}</b> ${esc(h.skill)} → ${esc(h.target)}${h.hp != null ? ` <span class="muted">(${h.hp}%)</span>` : ''}` }));
    (L.bossCasts || []).forEach(c => rows.push({ k: 'boss', t: c.t, cls: 'boss', html: `${ic(c.skill, 'xs')}<b>boss</b> ${esc(sn(L, c.skill))}${c.target ? ` → ${esc(c.target)}` : ''}` }));
    const healAt = (L.heals || []).map(h => ({ who: h.healer, sk: String(h.skill || '').toLowerCase(), s: secOfDay(h.t) }));   // a heal is in the feed once (heals log), not again as a skill
    const isLoggedHeal = (who, id, t) => { const n = sn(L, id).toLowerCase(), s = secOfDay(t); return healAt.some(h => h.who === who && h.sk === n && Math.abs(h.s - s) <= 2); };
    (L.party || []).forEach(p => lastSkills(L, p).filter(c => !isLoggedHeal(p.name, c.skill, hms(upd - c.ago * 1000))).forEach(c => rows.push({ k: 'skill', t: hms(upd - c.ago * 1000), cls: 'skill', html: `${ic(c.skill, 'xs')}<b>${esc(p.name)}</b> ${esc(sn(L, c.skill))}${c.target ? ` → ${esc(c.target)}` : ''}` })));
    const seen = new Set();
    const list = rows.filter(r => H.feed[r.k]).filter(r => { const k = r.t + r.html; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => secOfDay(b.t) - secOfDay(a.t)).slice(0, 80);
    const f = (k, t) => `<button type="button" class="rlh-f ${H.feed[k] ? 'on' : ''}" data-rlhf="${k}" aria-pressed="${H.feed[k] ? 'true' : 'false'}">${t}</button>`;
    return `<div class="rlh-fbar">${f('event', 'Events')}${f('heal', 'Heals')}${f('skill', 'Skills')}${f('boss', 'Boss')}</div>
      <div class="rlh-feed">${list.map(r => `<div class="fe ${r.cls}"><span class="t">${esc(r.t)}</span><span class="m">${r.html}</span></div>`).join('') || '<div class="muted">nothing yet</div>'}</div>`;
  }

  // ---------------------------------------------------------------------------------------------- damage
  function dmgMeter(L) {
    const secs = secsOf(L);
    const dm = (L.party || []).filter(p => p.dmg && (p.dmg.dealt || p.dmg.taken)).sort((x, y) => (y.dmg.dealt || 0) - (x.dmg.dealt || 0));
    const top = Math.max(1, ...dm.map(p => p.dmg.dealt || 0)), tot = Math.max(1, dm.reduce((a, p) => a + (p.dmg.dealt || 0), 0));
    return dm.map(p => `<div class="rl2-dt"><span class="nm">${esc(p.name)}</span><span class="bar"><i style="width:${Math.round(100 * (p.dmg.dealt || 0) / top)}%"></i></span><span class="v">${fmtK(p.dmg.dealt || 0)} <span class="muted">${Math.round(100 * (p.dmg.dealt || 0) / tot)}%${secs ? ' · ' + fmtK((p.dmg.dealt || 0) / secs) + '/s' : ''}</span></span><span class="tk muted" title="damage taken">🛡 ${fmtK(p.dmg.taken || 0)}</span></div>`).join('') || '<div class="muted">no damage logged yet</div>';
  }
  function dmgLog(L) {
    return `<div class="rlev rlh-dlog">${(L.dmgLog || []).slice(-40).reverse().map(d => `<div class="${d.dealt ? 'dl' : 'dt'}"><span class="t">${esc(d.t)}</span>${d.dealt ? `${esc(d.who)} → ${esc(d.other)}` : `${esc(d.other)} → ${esc(d.who)}`} <b>${Number(d.dmg).toLocaleString()}</b>${d.crit ? ' <span class="crit">CRIT</span>' : ''}</div>`).join('') || '<div class="muted">no hits logged</div>'}</div>`;
  }

  // ---------------------------------------------------------------------------------------------- drops (user 2026-10-09 09:50)
  // "it would be nice to see the actual drops and drop chance from the raid monster somewhere": the datapack drop list (/api/raid/<id>,
  // Scripts/data/raid_drops_h5.json, the same as the boss page), grouped by kind, chance x1.5 (L2Toggle rates) + what WE got from this boss
  // before and in this fight (/api/raidloot = Logs/raid_loot.log). Fetched once per boss / every 60 s, cached here.
  H.drops = {}; H.loot = {};
  function dropsLoad(L) {
    const id = L.bossId, name = (L.boss || {}).name;
    if (id && !H.drops[id]) {
      H.drops[id] = { state: 'loading' };
      api('/api/raid/' + encodeURIComponent(id) + '?party=' + encodeURIComponent(L.leader || '')).then(d => { H.drops[id] = { state: 'ok', d }; rerender(); })
        .catch(e => { H.drops[id] = { state: 'error', e: String(e.message || e) }; });
    }
    const lk = H.loot[name];
    if (name && (!lk || Date.now() - lk.at > 60000)) {
      H.loot[name] = Object.assign(lk || {}, { at: Date.now() });
      api('/api/raidloot?boss=' + encodeURIComponent(name)).then(r => { H.loot[name] = { at: Date.now(), kills: r.kills || [] }; rerender(); }).catch(() => { });
    }
  }
  const EQUIP = /^(weapon|armor|accessary|accessory|shield|chest|legs|head|gloves|feet|neck|earring|ring|fullarmor|rhand|lrhand|underwear|hair)/i;
  const GRADE_N = ['', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
  const gradeTxt = (g) => { g = String(g == null ? '' : g); const s = /^\d+$/.test(g) ? GRADE_N[+g] || '' : /^(NONE|0)?$/i.test(g) ? '' : g; return s ? s + '-grade' : ''; };
  function dropKind(it) {
    if (+it.id === 57) return 'Adena';
    if (/^Recipe/i.test(it.name)) return 'Recipes';
    if (/Scroll|Spellbook|Codex|Book of|Blueprint/i.test(it.name)) return 'Scrolls / books';
    if (EQUIP.test(it.slot || '')) return 'Equipment';
    return 'Materials / other';
  }
  function dropsPanel(L) {
    dropsLoad(L);
    const id = L.bossId, D = H.drops[id], name = (L.boss || {}).name;
    if (!id) return '<div class="muted">This boss is not in the datapack list (no drop table).</div>';
    if (!D || D.state === 'loading') return '<div class="muted">loading the drop list…</div>';
    if (D.state === 'error') return `<div class="muted">drop list not available (${esc(D.e)})</div>`;
    const rate = D.d.rate || 1.5, groups = {};
    (D.d.categories || []).forEach((c, gi) => (c.items || []).forEach(it => { const k = dropKind(it); (groups[k] = groups[k] || []).push(Object.assign({ group: gi + 1, oneOf: c.oneOf, spoil: c.kind === 'spoil' }, it)); }));
    const ORDER = ['Equipment', 'Recipes', 'Scrolls / books', 'Materials / other', 'Adena'];
    const got = {}; const kills = ((H.loot[name] || {}).kills || []);
    kills.forEach(k => Object.values(k.chars || {}).forEach(list => list.forEach(x => { got[x.id] = (got[x.id] || 0) + (x.count || 1); })));
    const rows = ORDER.filter(k => groups[k]).map(k => `<div class="rlh-dk">${esc(k)}</div>` + groups[k].sort((a, b) => b.effective - a.effective).map(it =>
      `<div class="rlh-drop ${got[it.id] ? 'got' : ''}" title="${esc(it.name)} — drop group ${it.group}${it.oneOf ? ' (one item of the group drops)' : ''}${it.spoil ? ' · spoil' : ''} · datapack ${it.overall}% · x${rate} ≈ ${it.effective}%${it.useful ? ' · ' + esc(it.useful) : ''}">` +
      `<img class="rlh-ic sm" src="${itemIcon(it.id)}" alt="" loading="lazy"><span class="nm">${esc(it.name)}${gradeTxt(it.grade) ? ` <span class="muted">${gradeTxt(it.grade)}</span>` : ''}${it.spoil ? ' <span class="chip unk">spoil</span>' : ''}</span>` +
      `<span class="ct muted">${it.min === it.max ? it.min : it.min + '–' + it.max}</span><span class="pc"><i style="width:${Math.min(100, it.effective)}%"></i><b>${it.effective}%</b></span>${got[it.id] ? `<span class="chip ok" title="we got this from ${esc(name)} before">×${got[it.id]}</span>` : '<span></span>'}</div>`).join('')).join('');
    const last = kills[0];
    const lastHtml = last ? `<div class="rlh-dk">Our last kill ${esc(new Date(last.at).toLocaleString())}${kills.length > 1 ? ` · ${kills.length} kills recorded` : ''}</div><div class="rlh-got">${Object.entries(last.chars || {}).map(([ch, items]) => `<div><span class="muted">${esc(ch)}:</span> ${items.map(x => `<span class="rlh-gi"><img class="rlh-ic xs" src="${itemIcon(x.id)}" alt="">${esc(x.name)}${x.count > 1 ? ' ×' + Number(x.count).toLocaleString() : ''}</span>`).join(' ')}</div>`).join('')}</div>` : `<div class="muted rlh-dk">No loot from ${esc(name)} recorded yet — this fight's drops show here right after the kill.</div>`;
    return `<div class="muted">Datapack chances ×${rate} (L2Toggle drop rate). A gold "×n" = we already got it from this boss. <a href="#/raid/${esc(id)}">Full boss page ›</a></div>${rows || '<div class="muted">no drop list in the datapack</div>'}${lastHtml}`;
  }
  function rerender() { try { if (typeof pollLive === 'function') pollLive(); } catch (e) { } }

  // ---------------------------------------------------------------------------------------------- user override (user 2026-10-09 09:50)
  // "an override button to ask a person to cast a skill or take a mana potion etc.": "Act" on a card opens the shared panel of
  // Dashboard/override.js (also used by the character page) with this member's live data from the raid file.
  function ovData(name) {
    const L = H.lastL; if (!L) return null;
    const p = (L.party || []).find(x => x.name === name); if (!p) return null;
    const st = p.st || {};
    return { hp: p.hp, mp: p.mp, cp: p.cp != null ? p.cp : st.cp, role: p.role, dead: !!p.dead, ov: st.ov || null, ageSec: (st.ageSec || 0) + (L.ageSec || 0),
      keySkills: keySkills(L, p), party: (L.party || []).map(x => ({ name: x.name, dead: !!x.dead, role: x.role })) };
  }
  document.addEventListener('click', (e) => {
    const o = e.target && e.target.closest && e.target.closest('[data-rlhovopen]'); if (!o) return;
    e.preventDefault();
    if (!window.Override) { uiAlert({ title: 'Override menu not loaded', body: 'The override menu (override.js) is not loaded yet — restart the dashboard server.', kind: 'error' }); return; }
    const n = o.dataset.rlhovopen, L = H.lastL || {}, i = (L.party || []).findIndex(x => x.name === n); H.ovName = n;
    Override.open(n, o, { context: H.lastSrc === 'kama' ? 'char' : 'raid', title: `${i + 1}. ${n}`, getData: () => ovData(n), skillName: (id) => sn(H.lastL || {}, id) });
  });
  // ---------------------------------------------------------------------------------------------- the raid HUD
  function html(L) {
    if (!L || !L.running) { if (H.lastL && H.lastSrc === 'raid') { H.lastL = null; if (H.ovName && window.Override && Override.isOpen(H.ovName)) Override.close(); } return ''; }   // the raid ended: close a panel opened from it
    track(L); H.lastL = L; H.lastSrc = 'raid';
    const b = L.boss || {}, party = L.party || [], up = party.filter(p => !p.dead).length, secs = secsOf(L), T = L.totals || {};
    const mins = L.minions || [], alive = mins.filter(m => !m.dead).length;
    const chips = [
      L.area && L.area.clearing ? `<span class="chip unk" title="monsters still to kill inside the clear area before the pull">clearing: ${L.area.clearLeft} left</span>` : '',
      `<span class="chip ${up === party.length ? 'ok' : 'bad'}">${up}/${party.length} alive</span>`,
      T.deaths ? `<span class="chip bad">✝ ${T.deaths} deaths</span>` : '<span class="chip ok">0 deaths</span>',
      T.res ? `<span class="chip ok">${T.res} res</span>` : '',
      `<span class="chip unk">${T.heals || 0} heals</span>`,
      T.ud ? `<span class="chip unk">UD ×${T.ud}</span>` : '',
      T.potions != null ? `<span class="chip unk">${T.potions} potions</span>` : '',
      T.dealt ? `<span class="chip unk">⚔ ${fmtK(T.dealt)}${secs ? ' · ' + fmtK(T.dealt / secs) + '/s' : ''}</span>` : '',
    ].join('');
    const debN = (L.debuffs || []).filter(d => !d.resisted && !d.interrupted).length;
    return `<div class="rlive rl2 rlh"><div class="rlh-head"><h2><span class="pulse"></span> LIVE raid: ${esc(b.name || '?')}</h2>
        <span class="muted">${secs ? '⏱ ' + mss(secs) + ' · ' : ''}${esc(L.phase || '')} · ${L.ageSec}s ago · leader ${esc(L.leader || '')}</span><span class="rlh-chips">${chips}</span></div>
      <div class="rlh-grid">
        ${sec('boss', 'Boss', bossPanel(L))}
        ${sec('debuffs', 'Debuffs on the boss', debuffPanel(L), `<span class="chip ${debN ? 'ok' : 'unk'}">${debN} active</span>`)}
        ${sec('map', 'Map', mapHtml(L))}
        ${sec('minions', 'Minions', minionPanel(L), `<span class="muted">${alive} alive · ${mins.length - alive} dead</span>`)}
        ${sec('drops', 'Drops', dropsPanel(L), L.bossLevel ? `<span class="muted">boss lvl ${L.bossLevel}</span>` : '')}
        ${sec('team', 'Team', teamGrid(L, [b].concat(mins.filter(m => !m.dead), L.others || [])))}
        ${sec('feed', 'Event feed', feed(L))}
        ${sec('dmg', 'Damage', `<div class="rl2-dmg">${dmgMeter(L)}</div>`)}
        ${sec('dlog', 'Damage log', dmgLog(L))}
      </div></div>`;
  }
  /** The same member cards for the Kamaloka live view (one look for every live view). */
  function kamaTeam(L) {
    if (!L) return '';
    track(L); H.lastL = L; H.lastSrc = 'kama';
    return sec('kteam', 'Team', teamGrid(L, L.mobs || []));
  }
  window.RaidLiveHUD = { html, kamaTeam, mapHtml, teamGrid, version: '2026-10-09' };
})();
