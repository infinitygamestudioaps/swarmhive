// LEVEL ETA (user 2026-10-09 13:20: "Under /char/* and other places I would like to have an estimate of when they will level up based on the
// current experience they are getting"). One shared helper for every page: window.LevelEta in the browser, module.exports in node (tests:
// docs/plan/tools/test_level_eta.js). Read-only, no fetches: it only reads the swarm_state fields swarm.js already writes.
//
// Input (swarm_state, /api/state, /api/live): level, exp (% into the level), expHour { pct, amt, n, mins } = sums over the last <= 60 min
// (mins = the window: 60, or less right after a script (re)start), expLog = the last 10 exp changes [{ amt, pct, at, why, lvl, up }].
// HOW THE RATE IS MADE:
//   1. expHour when it is trustworthy (window >= 5 min with >= 3 gains, or >= 2 min with >= 15 gains): EXP POINTS per hour, with every exp loss the log shows inside the
//      window (deaths) added back -- a death moves you back once (it is already in the exp %), it is not a slower hunting speed.
//      Points -> % of the CURRENT level with the level size (exp points per level), learned from same-level gains in any character's
//      exp log (all characters share the server's exp table; cached in this browser). So a level-up inside the window does not distort
//      the rate (the new level is bigger, the points/h are the same). Without a known level size: expHour's % sum, only when no level-up
//      is in sight.
//   2. else the exp log: the gains of the last 30 min AT THE CURRENT LEVEL (the window restarts at a level-up), >= 3 gains, >= 2 min.
//   3. smoothed per character (exponential, ~1 min; reset at a level-up or a source change) so the ETA does not jump on every refresh.
// STATES: ok | idle (no gain for 10+ min: town, travel, waiting) | none (no gains, or only losses) | warmup (window too short to measure)
//         | stale (no report for 2+ min: offline) | max (level cap) | unknown (no data).
// ETA = (100 - exp %) / (%/h). Above 48 h it is shown in days.
// Party: party(list) = when the party's LOWEST level goes up = the slowest member at the lowest level (spots are picked by the lowest level).
(function (root) {
  'use strict';
  const CFG = { maxLevel: 85, minHourMins: 5, minHourGains: 3, busyHourMins: 2, busyHourGains: 15, recentMins: 30, minRecentGains: 3, minRecentSpanMs: 120000,
    idleMs: 10 * 60000, staleSec: 120, daysAfterH: 48, tauMs: 60000, smoothResetMs: 10 * 60000 };
  const SIZE = {};   // level -> { v: exp points per level, w: |pct| weight it was learned from }
  const SM = {};     // name -> { r, t, lvl, src } smoothing state
  const LSKEY = 'levelEta.size.v1';
  const hasLS = () => { try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; } };
  try { if (hasLS()) Object.assign(SIZE, JSON.parse(localStorage.getItem(LSKEY) || '{}') || {}); } catch (e) { }
  let saveT = 0;
  const saveSizes = () => { if (!hasLS() || saveT) return; saveT = setTimeout(() => { saveT = 0; try { localStorage.setItem(LSKEY, JSON.stringify(SIZE)); } catch (e) { } }, 2000); };
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : null; };
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  /** browser: server clock = browser clock + skew (STATE.now is the server time of the last /api/state; remembered per value) */
  let skewRef = null, skewVal = 0;
  function srvNow(o) {
    if (o && num(o.now) != null) return num(o.now);
    if (o && num(o.skew) != null) return Date.now() + num(o.skew);
    try { if (typeof STATE !== 'undefined' && STATE && STATE.now && STATE.now !== skewRef) { skewRef = STATE.now; skewVal = Date.parse(STATE.now) - Date.now(); } } catch (e) { }
    return Date.now() + skewVal;
  }
  const cleanLog = (L) => (Array.isArray(L) ? L : []).filter(e => e && num(e.amt) != null && num(e.at) != null)
    .map(e => ({ amt: +e.amt, pct: num(e.pct) || 0, at: +e.at, why: String(e.why || ''), lvl: num(e.lvl), up: num(e.up) || 0 })).sort((a, b) => a.at - b.at);

  /** learn the level size (exp points per 100 %) from same-level gains; the most precise sample (largest % sum) wins */
  function learn(L) {
    const by = {};
    L.forEach(e => { if (e.amt > 0 && !e.up && e.lvl > 0 && e.pct > 0) { const b = by[e.lvl] = by[e.lvl] || { a: 0, p: 0 }; b.a += e.amt; b.p += e.pct; } });
    Object.keys(by).forEach(l => {
      const b = by[l]; if (b.p < 0.02) return;   // pct has 4 decimals: below 0.02 % the ratio is too coarse
      const v = b.a / b.p * 100, cur = SIZE[l];
      if (!cur || b.p >= cur.w || Math.abs(v - cur.v) / cur.v > 0.05) { SIZE[l] = { v: Math.round(v), w: Math.round(b.p * 10000) / 10000 }; saveSizes(); }
    });
  }
  function levelSize(level) { const s = SIZE[level]; return s && s.v > 0 ? s.v : null; }

  /**
   * The estimate for one character. o: { now (server ms), skew, exp (a more precise exp % e.g. MCP exp_percent), smooth (default true) }
   * -> { name, status, level, next, exp, pctH, ptsH, src ('hour'|'recent'), windowMin, gains, etaMs, at (browser ms), days, losses {n, amt, pct},
   *      lastGainAgoMs, size, why }
   */
  function calc(c, o) {
    o = o || {};
    const now = srvNow(o);
    const level = num(c && c.level), exp = num(o.exp != null ? o.exp : c && c.exp);
    const r = { name: c && c.name || '', status: 'unknown', level, next: level ? level + 1 : null, exp, pctH: null, ptsH: null, src: '', windowMin: null, gains: 0,
      etaMs: null, at: null, days: false, losses: { n: 0, amt: 0, pct: 0 }, lastGainAgoMs: null, size: null, why: '' };
    if (!c || !(level > 0) || exp == null) { r.why = 'no level / exp reported'; return r; }
    if (level >= CFG.maxLevel) { r.status = 'max'; r.why = 'level cap'; return r; }
    let age = num(c.ageSec);
    if (age == null && c.updated) { const t = Date.parse(c.updated); if (isFinite(t)) age = (now - t) / 1000; }
    const L = cleanLog(c.expLog);
    learn(L);
    const size = levelSize(level); r.size = size;
    const gainsAll = L.filter(e => e.amt > 0);
    const lastGain = gainsAll.length ? gainsAll[gainsAll.length - 1].at : null;
    r.lastGainAgoMs = lastGain != null ? Math.max(0, now - lastGain) : null;
    const lastUp = L.filter(e => e.up > 0 && e.lvl === level).reduce((m, e) => Math.max(m, e.at), 0) || null;
    if (age != null && age > CFG.staleSec) { r.status = 'stale'; r.why = 'no report for ' + Math.round(age / 60) + ' min (offline?)'; return r; }

    // 1. the hour window
    const H = c.expHour && typeof c.expHour === 'object' ? c.expHour : null;
    let pctH = null, src = '';
    if (H && ((num(H.mins) >= CFG.minHourMins && num(H.n) >= CFG.minHourGains) || (num(H.mins) >= CFG.busyHourMins && num(H.n) >= CFG.busyHourGains))) {
      const win = H.mins * 60000, lossW = L.filter(e => e.amt < 0 && now - e.at <= win);
      r.losses = { n: lossW.filter(e => e.why === 'death').length || lossW.length, amt: sum(lossW, e => e.amt), pct: Math.round(sum(lossW, e => e.pct) * 1000) / 1000 };
      const resW = L.filter(e => e.amt > 0 && e.why === 'res' && now - e.at <= win);   // exp given back by a resurrection: the death is left out too
      const ptsH = (num(H.amt) - r.losses.amt - sum(resW, e => e.amt)) / H.mins * 60;
      const upInWin = L.some(e => e.up > 0 && now - e.at <= win);
      if (size) { pctH = ptsH / size * 100; r.ptsH = Math.round(ptsH); src = 'hour'; }
      else if (!upInWin && num(H.pct) != null) { pctH = (num(H.pct) - r.losses.pct - sum(resW, e => e.pct)) / H.mins * 60; r.ptsH = Math.round(ptsH); src = 'hour'; }
      if (src) { r.windowMin = Math.round(H.mins); r.gains = num(H.n); }
    }
    // 2. the exp log (last 30 min at this level; restarts at a level-up)
    if (pctH == null) {
      const from = Math.max(now - CFG.recentMins * 60000, lastUp || 0);
      const G = L.filter(e => e.amt > 0 && !e.up && e.why !== 'res' && e.lvl === level && e.at > from && e.at <= now);
      const pctOf = (e) => size ? e.amt / size * 100 : e.pct;
      let span, P, n;
      if (lastUp && lastUp >= now - CFG.recentMins * 60000) { span = now - lastUp; P = sum(G, pctOf); n = G.length; }
      else if (G.length) { span = now - G[0].at; P = sum(G.slice(1), pctOf); n = G.length - 1; }
      if (G.length >= CFG.minRecentGains && span >= CFG.minRecentSpanMs && n > 0) {
        pctH = P / span * 3600000; src = 'recent'; r.windowMin = Math.round(span / 60000); r.gains = G.length;
        if (size) r.ptsH = Math.round(pctH / 100 * size);
        const lossR = L.filter(e => e.amt < 0 && e.at > from);
        r.losses = { n: lossR.filter(e => e.why === 'death').length || lossR.length, amt: sum(lossR, e => e.amt), pct: Math.round(sum(lossR, e => e.pct) * 1000) / 1000 };
      }
    }
    if (pctH == null) {
      const short = H && num(H.mins) != null && num(H.mins) < CFG.minHourMins;
      if (short || (!H && gainsAll.length)) { r.status = 'warmup'; r.why = 'measuring (needs ' + CFG.minHourMins + ' min of exp)'; }
      else if (L.some(e => e.amt < 0) && !gainsAll.length) { r.status = 'none'; r.why = 'only exp losses lately (death)'; }
      else { r.status = 'none'; r.why = 'no exp lately'; }
      return r;
    }
    // 3. smoothing
    if (o.smooth !== false && r.name) {
      const s = SM[r.name];
      if (!s || s.lvl !== level || s.src !== src || now - s.t > CFG.smoothResetMs || now < s.t) SM[r.name] = { r: pctH, t: now, lvl: level, src };
      else { const a = 1 - Math.exp(-(now - s.t) / CFG.tauMs); s.r += (pctH - s.r) * a; s.t = now; pctH = s.r; }
    }
    r.pctH = pctH; r.src = src;
    if (!(pctH > 0.0005)) { r.status = 'none'; r.why = r.losses.n ? 'only exp losses lately (death)' : 'no exp lately'; return r; }
    const left = Math.max(0, 100 - exp);
    r.etaMs = left / pctH * 3600000;
    r.at = Date.now() + r.etaMs;
    r.days = r.etaMs > CFG.daysAfterH * 3600000;
    if (r.lastGainAgoMs != null && r.lastGainAgoMs > CFG.idleMs) { r.status = 'idle'; r.why = 'no exp for ' + Math.round(r.lastGainAgoMs / 60000) + ' min'; return r; }
    r.status = 'ok';
    return r;
  }

  // ---------------------------------------------------------------- formatting
  function dur(ms, compact) {
    if (ms == null || !isFinite(ms)) return '?';
    const m = Math.round(ms / 60000);
    if (m < 1) return compact ? '<1m' : 'under a minute';
    if (ms < 3600000) return m + 'm';
    if (ms <= CFG.daysAfterH * 3600000) { const h = Math.floor(m / 60), mm = m % 60; return compact ? h + 'h' + String(mm).padStart(2, '0') : h + 'h' + (mm ? ' ' + mm + 'm' : ''); }
    const d = ms / 86400000;
    if (d > 60) return compact ? '60d+' : 'more than 60 days';
    return compact ? Math.round(d) + 'd' : (d < 10 ? d.toFixed(1) : Math.round(d)) + ' days';
  }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function clockOf(at, nowB) {
    if (at == null || !isFinite(at)) return '';
    const d = new Date(at), n = new Date(nowB != null ? nowB : Date.now()), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const sameDay = d.toDateString() === n.toDateString();
    if (sameDay) return hm;
    if (at - n.getTime() < 6.5 * 86400000) return DOW[d.getDay()] + ' ' + hm;
    return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
  }
  const rateTxt = (r) => r == null ? '?' : (Math.abs(r) >= 1 ? r.toFixed(1) : Math.abs(r) >= 0.1 ? r.toFixed(2) : r.toFixed(3)) + ' %/h';
  const nf = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

  /** 'lvl 52 in ~1h 25m (7.4 %/h)' / 'lvl 52: no exp for 14 min' / '' */
  function text(e) {
    if (!e) return '';
    if (e.status === 'ok') return `lvl ${e.next} in ~${dur(e.etaMs)} (${rateTxt(e.pctH)})`;
    if (e.status === 'idle') return `lvl ${e.next}: ${e.why} (was ${rateTxt(e.pctH)})`;
    if (e.status === 'none') return `lvl ${e.next}: ${e.why}`;
    if (e.status === 'warmup') return `lvl ${e.next}: measuring…`;
    if (e.status === 'max') return 'max level';
    if (e.status === 'stale') return '';
    return '';
  }
  /** compact: 'lvl in 1h25' / 'no exp 14m' / 'no exp' / '' */
  function short(e) {
    if (!e) return '';
    if (e.status === 'ok') return 'lvl in ' + dur(e.etaMs, true);
    if (e.status === 'idle') return 'no exp ' + Math.round(e.lastGainAgoMs / 60000) + 'm';
    if (e.status === 'none') return 'no exp';
    if (e.status === 'max') return 'max lvl';
    return '';
  }
  function clock(e) { return e && e.status === 'ok' && e.at ? 'at ~' + clockOf(e.at) : ''; }
  function title(e) {
    if (!e) return '';
    const L = [`Next level estimate${e.name ? ' for ' + e.name : ''}`];
    if (e.level) L.push(`Level ${e.level} at ${e.exp != null ? e.exp.toFixed(2) : '?'} % — ${e.exp != null ? Math.max(0, 100 - e.exp).toFixed(2) : '?'} % to go`);
    if (e.pctH != null) L.push(`Rate: ${rateTxt(e.pctH)}${e.ptsH != null ? ` (≈ ${nf(e.ptsH)} exp/h)` : ''} from ${e.src === 'hour' ? 'the last ' + e.windowMin + ' min' : 'the last ' + e.windowMin + ' min of kills at this level'} (${e.gains} gains)`);
    if (e.losses && e.losses.amt < 0) L.push(`${e.losses.n} exp loss${e.losses.n > 1 ? 'es' : ''} in that window (${e.losses.pct} %, death) — already in the exp %, not counted as a slower rate`);
    if (e.status === 'ok') L.push(`Level ${e.next} in ~${dur(e.etaMs)}, at ~${clockOf(e.at)}`);
    else if (e.why) L.push('No estimate: ' + e.why);
    L.push('How: exp points gained in the last hour (swarm.js expHour; the exp log when that is too short), deaths left out, converted to % of this level, smoothed. Refreshed with the page.');
    return L.join('\n');
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /** compact span for rows: <span class="le le-s ok">lvl in 1h25</span> ('' when nothing to say) */
  function shortHtml(c, o) {
    const e = calc(c, o), t = short(e);
    return t ? `<span class="le le-s ${e.status}${e.days ? ' days' : ''}" title="${esc(title(e))}">${esc(t)}</span>` : '';
  }
  /** full line for the character page: 'lvl 52 in ~1h 25m · at ~14:47 · 7.4 %/h · last 35 min' */
  function lineHtml(c, o) {
    const e = calc(c, o);
    if (e.status === 'stale' || e.status === 'unknown') return '';
    let inner;
    if (e.status === 'ok') inner = `<b>lvl ${e.next} in ~${esc(dur(e.etaMs))}</b><span>${esc(clock(e))}</span><span>${esc(rateTxt(e.pctH))}</span><span class="le-src">${e.src === 'hour' ? 'last ' + e.windowMin + ' min' : 'recent kills'}${e.losses.amt < 0 ? ` · ${e.losses.n} death${e.losses.n > 1 ? 's' : ''} left out` : ''}</span>`;
    else inner = `<b>${esc(text(e))}</b>`;
    return `<div class="le le-line ${e.status}${e.days ? ' days' : ''}" title="${esc(title(e))}">${inner}</div>`;
  }
  /** a thin marker on an EXP gauge where the bar will be in `mins` minutes (only when the level is not reached by then) */
  function markHtml(c, o, mins) {
    const e = calc(c, o); mins = mins || 30;
    if (e.status !== 'ok' || e.exp == null) return '';
    const to = e.exp + e.pctH * mins / 60;
    if (to >= 100) return `<b class="le-mk lvl" style="left:calc(100% - 2px)" title="levels up within ${mins} min"></b>`;
    if (to - e.exp < 0.3) return '';
    return `<b class="le-fut" style="left:${e.exp.toFixed(2)}%;width:${(to - e.exp).toFixed(2)}%"></b><b class="le-mk" style="left:${to.toFixed(2)}%" title="in ${mins} min: ~${to.toFixed(1)} %"></b>`;
  }
  /** put the marker into a gauge() html string (before its closing </div>) */
  function withMark(gaugeHtml, c, o, mins) { const m = markHtml(c, o, mins); return m ? String(gaugeHtml).replace(/<\/div>\s*$/, m + '</div>') : gaugeHtml; }

  /** when the party's LOWEST level goes up: the slowest member at the lowest level (online members only) */
  function party(list, o) {
    o = o || {};
    const on = (list || []).filter(c => c && num(c.level) > 0 && !(num(c.ageSec) > CFG.staleSec));
    if (!on.length) return null;
    const minL = Math.min(...on.map(c => +c.level));
    const M = on.filter(c => +c.level === minL).map(c => ({ c, e: calc(c, o) }));
    const bad = M.filter(x => x.e.status !== 'ok');
    const out = { level: minL, next: minL + 1, n: M.length, names: M.map(x => x.c.name), status: 'ok', etaMs: null, at: null, who: '', days: false, missing: bad.map(x => ({ name: x.c.name, why: x.e.why || x.e.status })) };
    if (minL >= CFG.maxLevel) { out.status = 'max'; return out; }
    if (bad.length) { out.status = 'unknown'; return out; }
    const slow = M.reduce((a, x) => (x.e.etaMs > a.e.etaMs ? x : a));
    Object.assign(out, { etaMs: slow.e.etaMs, at: slow.e.at, who: slow.c.name, days: slow.e.days });
    return out;
  }
  function partyText(p) {
    if (!p) return '';
    if (p.status === 'max') return `lowest lvl ${p.level} (max)`;
    if (p.status === 'unknown') return `lowest lvl ${p.level}: no estimate for ${p.missing.map(m => m.name).join(', ')}`;
    return `lowest lvl ${p.level} → ${p.next} in ~${dur(p.etaMs)} (at ~${clockOf(p.at)})`;
  }
  function partyHtml(list, o) {
    const p = party(list, o); if (!p) return '';
    const t = [`When the party's lowest level (${p.level}) goes up — hunting spots are picked by the lowest level.`,
      `Members at level ${p.level} (online): ${p.names.join(', ')}.`,
      p.status === 'ok' ? `${p.n > 1 ? 'The last of them' : 'It'} (${p.who}) reaches ${p.next} in ~${dur(p.etaMs)}, at ~${clockOf(p.at)}.` : '',
      p.missing.length ? 'No estimate: ' + p.missing.map(m => `${m.name} (${m.why})`).join(', ') : '',
      'Each estimate: exp gained in the last hour (deaths left out), see the member rows.'].filter(Boolean).join('\n');
    const txt = p.status === 'ok' ? `lowest ${p.level}→${p.next} in ${dur(p.etaMs, true)}${p.n > 1 ? ' (' + p.who + ' last)' : ''}` : partyText(p);
    return `<span class="le le-party ${p.status}" title="${esc(t)}">${esc(txt)}</span>`;
  }

  // ---------------------------------------------------------------- styles (own, so no extra stylesheet has to be served)
  const CSS = `
.le { white-space: nowrap; }
.le-s { font: 700 var(--fs-mini, 11px) Consolas, monospace; color: #9fd7a0; margin-left: 5px; }
.le-s.idle, .le-s.none { color: var(--muted, #9a927f); font-weight: 400; }
.le-s.days { color: #c9b98e; }
.le-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; white-space: normal; font-size: var(--fs-cap, 12px); color: var(--muted, #9a927f); line-height: 1.35; }
.le-line b { color: #9fd7a0; font-size: var(--fs-body, 13px); }
.le-line.idle b, .le-line.none b, .le-line.warmup b { color: var(--muted, #9a927f); font-weight: 400; }
.le-line .le-src { font-size: var(--fs-mini, 11px); }
.le-party { font-size: var(--fs-cap, 12px); color: #9fd7a0; font-weight: 400; }
.le-party.unknown { color: var(--muted, #9a927f); }
.gauge .le-fut { position: absolute; top: 0; bottom: 0; background: rgba(255, 236, 160, .18); pointer-events: none; }
.gauge .le-mk { position: absolute; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; background: #ffe9a8; box-shadow: 0 0 2px #000; pointer-events: auto; }
.gauge .le-mk.lvl { background: #9fd7a0; }
.cp-bars > .le-line { grid-column: 1 / -1; padding-left: 36px; margin-top: -1px; }
@media (min-width: 1000px) { .cp-bars > .le-line { grid-column: 4; } }
.gauges + .le-line { margin-top: 4px; }
.lpm .xp .le-s { display: block; margin-left: 0; text-align: right; font-weight: 400; }
#accBody .le-s { margin-left: 8px; }
@media (prefers-reduced-motion: no-preference) { .gauge .le-mk { transition: left .7s ease; } }`;
  if (typeof document !== 'undefined' && document.head && !document.getElementById('levelEtaCss')) {
    const st = document.createElement('style'); st.id = 'levelEtaCss'; st.textContent = CSS; document.head.appendChild(st);
  }

  const API = { calc, text, short, clock, title, dur, clockOf, rateTxt, shortHtml, lineHtml, markHtml, withMark, party, partyText, partyHtml,
    levelSize, CFG, _reset() { Object.keys(SIZE).forEach(k => delete SIZE[k]); Object.keys(SM).forEach(k => delete SM[k]); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.LevelEta = API;
})(typeof window !== 'undefined' ? window : null);
