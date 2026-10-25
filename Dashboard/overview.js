// OVERVIEW page #/overview — the start page (OVERVIEW-2026-10-24; owner: "a Dashboard overview, so a complete overview, compact with animation,
// icons and most important of all statistics for all parties and characters, experience, adena, everything so we can see when they level up,
// what they make per hour, what their cost is etc. ... make it the default page, then we should also have /parties").
//   big totals (count up) -> "next level-ups" countdown strip + "just levelled" -> [Parties] one card each (exp line, rates, members)
//   | [Characters] every character, sortable. Last hour / 24 h. Tap a character = #/char/<name>, a party title = #/parties.
// Data: /api/overview (Dashboard/overview_api.js; its 60 s recorder Logs/overview_<day>.tsv, so the 24 h numbers fill in over the first day).
// Uses index.html globals: api, stopChar, TAB, classIcon, UI. In-game icons only, phone-first.
(function () {
  'use strict';
  const SEC = 'tab-overview';
  const S = { open: false, hours: 1, view: 'parties', sort: 'profitH', dir: -1, q: '', d: null, skew: 0, poll: 0, tick: 0, seq: 0, shown: {}, openP: {} };
  try { const v = JSON.parse(localStorage.getItem('ovPrefs') || '{}'); if (v.hours === 24) S.hours = 24; if (v.view === 'chars') S.view = 'chars'; if (v.sort) S.sort = v.sort; } catch (e) { }
  const save = () => { try { localStorage.setItem('ovPrefs', JSON.stringify({ hours: S.hours, view: S.view, sort: S.sort })); } catch (e) { } };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IC = (p, c, t) => `<img class="ovi${c ? ' ' + c : ''}" src="/icons/${p}.png" alt=""${t ? ` title="${h(t)}"` : ''} onerror="this.style.visibility='hidden'">`;
  const U = (k, d) => (typeof UI !== 'undefined' && UI[k]) || d;
  const ICO = { profit: 'icon/etc_adena_i00', exp: 'L2UI_CT1/ICON_DF_premiumItem', loot: 'icon/etc_treasure_box_i00', cost: 'icon/etc_spirit_bullet_white_i00',
    kills: 'icon/action003', online: 'icon/action015', dead: 'icon/skill1016', adena: 'icon/etc_adena_i00', level: 'L2UI_CT1/ICON_DF_premiumItem', party: 'L2UI_CT1/crop/Icon_DF_MenuWnd_Clan' };
  const ACT = [[/raid|circuit|epic/, 'icon/accessory_raid_master_i00', 'Raid'], [/kama|instance/, 'L2UI_CT1/ICON_DF_SIEGE_SHIELD', 'Instance'], [/autolevel|hunt|farm|level/, 'icon/action003', 'Hunting'],
    [/trade|sell|stash|ware|supply|buy|shop/, 'icon/action010', 'Town errand'], [/rest|sit/, 'icon/action001', 'Resting'], [/town|travel|route|goto|walk|tele/, 'icon/etc_scroll_of_return_i00', 'Travelling'],
    [/follow/, 'icon/action007', 'Following'], [/quest/, 'L2UI_CT1/crop/Icon_DF_MenuWnd_Quest', 'Quest'], [/siege|fort|castle/, 'L2UI_CT1/ICON_DF_SIEGE_SWORD', 'Siege']];
  const actOf = (a, t) => { const s = (String(a || '') + ' ' + String(t || '')).toLowerCase(); for (const [re, ic, n] of ACT) if (re.test(s)) return { ic, n }; return { ic: 'icon/action006', n: 'Idle' }; };

  const short = (n) => { n = Number(n || 0); const a = Math.abs(n), s = n < 0 ? '−' : '';
    return a >= 1e9 ? s + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'bn' : a >= 1e6 ? s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e4 ? s + Math.round(a / 1e3) + 'k' : s + Math.round(a).toLocaleString('en-US'); };
  const sign = (n) => (Number(n) > 0 ? '+' : '') + short(n);
  const dur = (ms) => { if (!(ms > 0)) return 'now'; const m = Math.floor(ms / 60000); if (m < 1) return Math.ceil(ms / 1000) + 's'; if (m < 60) return m + 'm ' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + 's';
    const hh = Math.floor(m / 60); return hh < 48 ? hh + 'h ' + String(m % 60).padStart(2, '0') + 'm' : Math.round(hh / 24) + ' days'; };
  const ago = (t) => { const m = Math.round((Date.now() + S.skew - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
  const cls = (c) => { try { return classIcon({ name: c.name, classId: c.classId, role: c.role, cls: c.cls }, 'ovc'); } catch (e) { return IC(U('char', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Character'), 'ovc'); } };
  const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win ovp'; s.hidden = true;
    s.innerHTML = `<style>
.ovp { max-width: 100%; overflow-x: hidden; } .ovp { --ovg: linear-gradient(135deg, rgba(227,194,122,.16), rgba(127,182,232,.06)); padding-bottom: 24px; }
.ovp .ovi { width: 22px; height: 22px; vertical-align: middle; border-radius: 4px; }
.ovp .ovc { width: 26px; height: 26px; border-radius: 50%; }
.ov-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.ov-top h2 { margin: 0; font-size: var(--fs-title); color: var(--gold); display: flex; gap: 8px; align-items: center; }
.ov-seg { display: inline-flex; border: 1px solid var(--line2); border-radius: 999px; overflow: hidden; }
.ov-seg button { background: none; border: 0; color: var(--muted); padding: 6px 12px; font: inherit; font-size: var(--fs-cap); cursor: pointer; min-height: 32px; }
.ov-seg button.on { background: rgba(227,194,122,.18); color: var(--gold); }
.ov-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 45%), 1fr)); gap: 8px; margin-bottom: 12px; }
.ov-k { position: relative; overflow: hidden; background: var(--ovg); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; animation: ovIn .5s both; }
.ov-k::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.06) 50%, transparent 70%); transform: translateX(-100%); animation: ovShine 6s infinite; }
.ov-k .l { color: var(--muted); font-size: var(--fs-cap); display: flex; gap: 6px; align-items: center; }
.ov-k .v { font-size: 22px; font-weight: bold; color: var(--ink); margin-top: 2px; font-variant-numeric: tabular-nums; }
.ov-k .s { color: var(--muted); font-size: var(--fs-mini); }
.ov-k.good .v { color: var(--ok); } .ov-k.bad .v { color: var(--bad); } .ov-k.gold .v { color: var(--gold); }
.ov-strip { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; margin-bottom: 12px; }
@media (max-width: 760px) { .ov-strip { grid-template-columns: minmax(0, 1fr); } }
.ov-box { background: var(--box); border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.ov-box h3 { margin: 0 0 6px; font-size: var(--fs-section); color: var(--gold); display: flex; gap: 6px; align-items: center; }
.ov-row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: thin; padding-bottom: 2px; }
.ov-chip { flex: 0 0 auto; display: flex; gap: 6px; align-items: center; background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px 3px 3px; cursor: pointer; font-size: var(--fs-cap); }
.ov-chip b { color: var(--ink); } .ov-chip .t { color: var(--run); font-variant-numeric: tabular-nums; }
.ov-chip.up { border-color: var(--gold); box-shadow: 0 0 0 0 rgba(227,194,122,.6); animation: ovPulse 2s infinite; } .ov-chip.up .t { color: var(--gold); }
.ov-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.ov-tools input, .ov-tools select { min-height: 32px; background: rgba(0,0,0,.35); color: var(--ink); border: 1px solid var(--line2); border-radius: 8px; padding: 4px 8px; font: inherit; font-size: var(--fs-cap); }
.ov-tools input { flex: 1 1 160px; }
.ov-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 10px; }
@media (max-width: 720px) { .ov-grid { grid-template-columns: minmax(0, 1fr); } }
.ov-p { background: var(--box); border: 1px solid var(--line); border-radius: 14px; padding: 10px; animation: ovIn .45s both; transition: border-color .3s, transform .2s; }
.ov-p:hover { border-color: var(--line2); }
.ov-p.lvl { border-color: var(--gold); }
.ov-ph { display: flex; gap: 8px; align-items: center; cursor: pointer; }
.ov-ph .n { font-weight: bold; color: var(--gold); font-size: var(--fs-em); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ov-ph .w { color: var(--muted); font-size: var(--fs-mini); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ov-ph .gap { flex: 1; }
.ov-badge { font-size: var(--fs-mini); border: 1px solid var(--line2); border-radius: 999px; padding: 1px 7px; color: var(--muted); white-space: nowrap; }
.ov-badge.ok { color: var(--ok); border-color: rgba(134,207,110,.4); } .ov-badge.bad { color: var(--bad); border-color: rgba(236,106,85,.5); }
.ov-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); display: inline-block; box-shadow: 0 0 0 0 rgba(134,207,110,.7); animation: ovPulse 2.2s infinite; }
.ov-dot.off { background: var(--muted); animation: none; } .ov-dot.dead { background: var(--bad); }
.ov-nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 8px 0 6px; }
.ov-n { background: rgba(255,255,255,.03); border-radius: 8px; padding: 4px 6px; min-width: 0; }
.ov-n .l { color: var(--muted); font-size: var(--fs-mini); white-space: nowrap; }
.ov-n .v { font-weight: bold; font-variant-numeric: tabular-nums; font-size: var(--fs-em); white-space: nowrap; }
.ov-n .v.good { color: var(--ok); } .ov-n .v.bad { color: var(--bad); }
.ov-spark { display: block; width: 100%; height: 34px; }
.ov-next { display: flex; justify-content: space-between; gap: 6px; font-size: var(--fs-cap); color: var(--muted); margin: 2px 0 6px; }
.ov-next b { color: var(--run); font-variant-numeric: tabular-nums; }
.ov-ms { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px; }
.ov-m { display: flex; gap: 6px; align-items: center; padding: 3px 4px; border-radius: 8px; cursor: pointer; min-width: 0; }
.ov-m:hover { background: rgba(255,255,255,.05); }
.ov-m .mi { min-width: 0; flex: 1; }
.ov-m .mn { font-size: var(--fs-cap); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ov-m .mn i { font-style: normal; color: var(--gold); }
.ov-bar { height: 4px; background: rgba(255,255,255,.08); border-radius: 4px; overflow: hidden; margin-top: 2px; }
.ov-bar > span { display: block; height: 100%; background: linear-gradient(90deg, #a77b2b, var(--gold)); border-radius: 4px; transition: width 1s ease; position: relative; }
.ov-bar > span::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent); animation: ovFlow 2.4s linear infinite; }
.ov-m .me { font-size: var(--fs-mini); color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.ov-ring { position: relative; width: 30px; height: 30px; flex: 0 0 30px; }
.ov-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
.ov-ring img { position: absolute; inset: 2px; width: 26px; height: 26px; border-radius: 50%; }
.ov-ring circle { transition: stroke-dashoffset 1s ease; }
.ov-more { margin-top: 6px; font-size: var(--fs-mini); color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 10px; }
.ov-t { width: 100%; border-collapse: collapse; font-size: var(--fs-cap); }
.ov-t th { text-align: right; color: var(--muted); font-weight: normal; padding: 6px 6px; border-bottom: 1px solid var(--line); cursor: pointer; white-space: nowrap; position: sticky; top: 0; background: #0b1012; }
.ov-t th.on { color: var(--gold); } .ov-t th:first-child, .ov-t td:first-child { text-align: left; }
.ov-t td { text-align: right; padding: 5px 6px; border-bottom: 1px solid rgba(255,255,255,.04); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ov-t tr { cursor: pointer; animation: ovIn .3s both; } .ov-t tr:hover td { background: rgba(255,255,255,.04); }
.ov-t td .good { color: var(--ok); } .ov-t td .bad { color: var(--bad); }
.ov-twrap { overflow-x: auto; max-height: 75vh; border: 1px solid var(--line); border-radius: 12px; }
@media (max-width: 640px) {
  .ov-t thead { display: none; } .ov-t, .ov-t tbody, .ov-t tr, .ov-t td { display: block; } .ov-t tr { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 6px; padding: 8px; border-bottom: 1px solid var(--line); }
  .ov-t td { text-align: left; border: 0; padding: 0; } .ov-t td:first-child { grid-column: 1 / -1; } .ov-t td[data-l]::before { content: attr(data-l) ' '; color: var(--muted); font-size: var(--fs-mini); display: block; }
  .ov-k .v { font-size: 18px; } .ov-nums { grid-template-columns: repeat(2, 1fr); }
}
.ov-note { color: var(--muted); font-size: var(--fs-mini); margin-top: 10px; }
.ov-conf { position: fixed; pointer-events: none; z-index: 9999; font-size: 18px; animation: ovConf 1.6s ease-out forwards; }
@keyframes ovIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes ovShine { 0%, 70% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
@keyframes ovPulse { 0% { box-shadow: 0 0 0 0 rgba(227,194,122,.55); } 70% { box-shadow: 0 0 0 8px rgba(227,194,122,0); } 100% { box-shadow: 0 0 0 0 rgba(227,194,122,0); } }
@keyframes ovFlow { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
@keyframes ovConf { from { opacity: 1; transform: translate(0,0) rotate(0); } to { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(540deg); } }
@media (prefers-reduced-motion: reduce) { .ovp *, .ovp *::after { animation: none !important; transition: none !important; } }
</style>
<div class="ov-top"><h2>${IC(ICO.party)} Overview <span class="ov-badge" id="ovRec"></span></h2>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><div class="ov-seg" id="ovHours"></div><div class="ov-seg" id="ovView"></div></div></div>
<div class="ov-kpis" id="ovKpis"></div>
<div class="ov-strip"><div class="ov-box"><h3>${IC(ICO.level)} Next level-ups</h3><div class="ov-row" id="ovSoon"></div></div>
  <div class="ov-box"><h3>${IC('L2UI_CT1/ICON_DF_premiumItem')} Just levelled</h3><div class="ov-row" id="ovUps"></div></div></div>
<div class="ov-tools"><input id="ovQ" type="search" placeholder="Find a party or character…" aria-label="Find"><select id="ovSort" aria-label="Sort"></select></div>
<div id="ovBody"></div>
<div class="ov-note" id="ovNote"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    $id('ovQ').addEventListener('input', (e) => { S.q = e.target.value.trim().toLowerCase(); renderBody(); });
    $id('ovSort').addEventListener('change', (e) => { S.sort = e.target.value; S.dir = S.sort === 'name' || S.sort === 'eta' ? 1 : -1; save(); renderBody(); });
    return s;
  }
  const SORTS = [['profitH', 'Profit / h'], ['expH', 'Exp / h'], ['lootH', 'Loot / h'], ['costH', 'Costs / h'], ['killsH', 'Kills / h'], ['adena', 'Adena'], ['level', 'Level'], ['eta', 'Next level-up'], ['name', 'Name']];

  function route(kind) { if (kind === 'overview' || kind === '' || kind == null) { open(); return true; } close(); return false; }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'overview'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'overview')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; window.scrollTo(0, 0);
    renderSeg(); load();
    clearInterval(S.poll); S.poll = setInterval(() => { if (S.open && !document.hidden) load(); }, 30000);
    clearInterval(S.tick); S.tick = setInterval(() => { if (S.open && !document.hidden) tickClocks(); }, 1000);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); clearInterval(S.tick); const s = $id(SEC); if (s) s.hidden = true; }
  async function load() {
    const my = ++S.seq;
    try { const d = await api('/api/overview?hours=' + S.hours); if (my !== S.seq || !d || d.error) return; S.skew = d.at - Date.now(); const prev = S.d; S.d = d; render(prev); } catch (e) { }
  }
  function renderSeg() {
    $id('ovHours').innerHTML = [[1, 'Last hour'], [24, '24 h']].map(([v, t]) => `<button data-ovh="${v}" class="${S.hours === v ? 'on' : ''}">${t}</button>`).join('');
    $id('ovView').innerHTML = [['parties', 'Parties'], ['chars', 'Characters']].map(([v, t]) => `<button data-ovv="${v}" class="${S.view === v ? 'on' : ''}">${t}</button>`).join('');
    $id('ovSort').innerHTML = SORTS.map(([v, t]) => `<option value="${v}"${S.sort === v ? ' selected' : ''}>Sort: ${t}</option>`).join('');
  }

  // numbers count up from what was shown before
  function countUp(el, to, fmt) {
    const from = Number(el.dataset.v || 0); el.dataset.v = to;
    if (reduce() || from === to || !isFinite(from)) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), D = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function render(prev) {
    const d = S.d, T = d.total, per = S.hours === 1 ? '/ h' : '/ h (24 h avg)';
    const recH = (d.at - d.recordingSince) / 3600000;
    $id('ovRec').textContent = recH < S.hours ? `recording ${recH < 1 ? Math.round(recH * 60) + ' min' : recH.toFixed(1) + ' h'}` : 'live';
    $id('ovRec').title = 'The statistics recorder samples every character once a minute. 24 h numbers fill in over the first day.';
    const K = [
      ['profitH', 'Profit ' + per, ICO.profit, T.profitH, sign, T.profitH >= 0 ? 'good' : 'bad', `wallet ${sign(T.adenaH)} + loot worth ${short(T.lootH)}`],
      ['expH', 'Experience ' + per, ICO.exp, T.expH, short, 'gold', `${T.levels > 0 ? T.levels + ' level-ups · ' : ''}avg level ${T.avgLevel}`],
      ['adena', 'Adena (all bags)', ICO.adena, T.adena, short, '', `wallet change ${sign(T.adenaH)} ${per}`],
      ['lootH', 'Loot worth ' + per, ICO.loot, T.lootH, short, '', 'at shop price, until sold'],
      ['costH', 'Costs ' + per, ICO.cost, T.costH, short, 'bad', `shots & potions ${short(T.useH)} · gear ${short(T.gearH)}`],
      ['killsH', 'Kills ' + per, ICO.kills, T.killsH, short, '', `${T.deaths} death${T.deaths === 1 ? '' : 's'} in ${S.hours === 1 ? 'the last hour' : '24 h'}`],
      ['online', 'Online', ICO.online, T.online, (v) => Math.round(v) + ' / ' + T.n, T.online === T.n ? 'good' : '', T.dead ? `${T.dead} dead right now` : 'all alive'],
    ];
    const box = $id('ovKpis');
    if (box.children.length !== K.length) box.innerHTML = K.map(([k], i) => `<div class="ov-k" data-k="${k}" style="animation-delay:${i * 60}ms"><div class="l"></div><div class="v"></div><div class="s"></div></div>`).join('');
    K.forEach(([k, l, ic, v, fmt, c, s], i) => { const el = box.children[i]; el.className = 'ov-k ' + c; el.querySelector('.l').innerHTML = IC(ic) + h(l); countUp(el.querySelector('.v'), Number(v) || 0, fmt); el.querySelector('.s').textContent = s; });
    $id('ovSoon').innerHTML = d.soon.length ? d.soon.map(c => `<div class="ov-chip" data-ovc="${h(c.name)}" title="${h(c.party)}">${cls(c)}<b>${h(c.name)}</b> → ${c.level + 1} <span class="t" data-at="${c.at}"></span></div>`).join('') : '<span class="ov-note">No estimate yet — needs a few minutes of hunting.</span>';
    $id('ovUps').innerHTML = d.ups.length ? d.ups.map(c => `<div class="ov-chip ${d.at - c.at < 15 * 60000 ? 'up' : ''}" data-ovc="${h(c.name)}">${cls(c)}<b>${h(c.name)}</b> reached ${c.level} <span class="t">${ago(c.at)}</span></div>`).join('') : '<span class="ov-note">No level-up in the last 6 hours.</span>';
    // confetti for a level-up that appeared since the last refresh
    if (prev && !reduce()) for (const c of d.ups) if (!prev.ups.some(p => p.name === c.name && p.at === c.at) && d.at - c.at < 10 * 60000) confetti($id('ovUps'));
    renderBody(); tickClocks();
    const t = new Date(d.at);
    $id('ovNote').innerHTML = `Updated ${t.toLocaleTimeString()} · every 30 s. Profit = wallet change + loot worth (items count at shop price until sold; shots, potions and gear are already paid from the wallet, shown under Costs). Adena handed between characters cancels out inside a party. <a href="#/parties">Party controls → Parties</a>`;
  }
  function confetti(anchor) {
    const r = anchor.getBoundingClientRect(), x = r.left + Math.min(r.width, 200) / 2, y = r.top + 10;
    for (let i = 0; i < 18; i++) {
      const e = document.createElement('div'); e.className = 'ov-conf'; e.textContent = ['✦', '✧', '★', '◆'][i % 4];
      e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.color = ['#e3c27a', '#86cf6e', '#7fb6e8', '#ec6a55'][i % 4];
      e.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px'); e.style.setProperty('--dy', (Math.random() * -160 - 20) + 'px');
      document.body.appendChild(e); setTimeout(() => e.remove(), 1700);
    }
  }
  function tickClocks() {
    const now = Date.now() + S.skew;
    document.querySelectorAll('#' + SEC + ' [data-at]').forEach(el => { const at = Number(el.dataset.at); el.textContent = at ? dur(at - now) : '—'; });
  }

  const val = (x, k) => k === 'eta' ? (x.eta && x.eta.at) || (x.next && x.next.at) || 9e15 : k === 'name' ? (x.name || x.leader || '').toLowerCase() : k === 'level' ? (x.level != null ? x.level : x.avgLevel) : Number(x[k]) || 0;
  const sorter = (a, b) => { const A = val(a, S.sort), B = val(b, S.sort); return (A < B ? -1 : A > B ? 1 : 0) * S.dir; };
  function renderBody() {
    const d = S.d; if (!d) return;
    const q = S.q, body = $id('ovBody');
    if (S.view === 'chars') {
      const list = d.chars.filter(c => !q || c.name.toLowerCase().includes(q) || c.party.toLowerCase().includes(q) || String(c.cls).toLowerCase().includes(q)).sort(sorter);
      const cols = [['name', 'Character'], ['level', 'Level'], ['eta', 'Next level'], ['expH', 'Exp / h'], ['profitH', 'Profit / h'], ['lootH', 'Loot / h'], ['costH', 'Costs / h'], ['adena', 'Adena'], ['killsH', 'Kills / h'], ['deaths', 'Deaths']];
      body.innerHTML = `<div class="ov-twrap"><table class="ov-t"><thead><tr>${cols.map(([k, t]) => `<th data-ovs="${k}" class="${S.sort === k ? 'on' : ''}">${t}${S.sort === k ? (S.dir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>${list.map((c, i) => {
        const a = actOf(c.activity, c.task);
        return `<tr data-ovc="${h(c.name)}" style="animation-delay:${Math.min(i, 30) * 15}ms"><td><span class="ov-dot ${c.dead ? 'dead' : c.online ? '' : 'off'}"></span> ${cls(c)} <b>${h(c.name)}</b> ${IC(a.ic, '', a.n)} <span class="ov-badge">${h(c.party)}</span></td>
          <td data-l="Level">${c.level || '—'} <span class="ov-badge">${c.exp != null ? c.exp.toFixed(1) + '%' : ''}</span></td><td data-l="Next level"><span data-at="${c.eta && c.eta.status === 'ok' && c.eta.at ? c.eta.at : ''}"></span></td>
          <td data-l="Exp / h">${c.expH != null ? short(c.expH) : '—'}${c.pctH != null ? ` <span class="ov-badge">${c.pctH}%</span>` : ''}</td><td data-l="Profit / h"><span class="${c.profitH >= 0 ? 'good' : 'bad'}">${sign(c.profitH)}</span></td>
          <td data-l="Loot / h">${short(c.lootH)}</td><td data-l="Costs / h"><span class="bad">${short(c.costH)}</span></td><td data-l="Adena">${short(c.adena)}</td><td data-l="Kills / h">${c.killsH != null ? c.killsH : '—'}</td><td data-l="Deaths">${c.deaths ? `<span class="bad">${c.deaths}</span>` : 0}</td></tr>`;
      }).join('')}</tbody></table></div>`;
      return;
    }
    const parties = d.parties.filter(p => !q || p.leader.toLowerCase().includes(q) || p.members.some(m => m.name.toLowerCase().includes(q))).sort(sorter);
    body.innerHTML = `<div class="ov-grid">${parties.map((p, i) => partyCard(p, i)).join('')}</div>`;
  }
  function sparkSvg(p) {
    const ms = p.members.filter(m => m.spark && m.spark.length > 1 && m.spark.every(v => v != null)); if (!ms.length) return '';
    const n = ms[0].spark.length, pts = []; for (let i = 0; i < n; i++) pts.push(ms.reduce((t, m) => t + (m.spark[i] - m.spark[0]), 0));
    const max = Math.max(1, ...pts), min = Math.min(0, ...pts), W = 300, H = 34, id = 'ovg' + p.leader;
    const xy = pts.map((v, i) => `${(i / (n - 1) * W).toFixed(1)},${(H - 2 - (v - min) / (max - min) * (H - 6)).toFixed(1)}`).join(' ');
    return `<svg class="ov-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="experience over the window"><defs><linearGradient id="${h(id)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e3c27a" stop-opacity=".35"/><stop offset="1" stop-color="#e3c27a" stop-opacity="0"/></linearGradient></defs>
      <polygon points="0,${H} ${xy} ${W},${H}" fill="url(#${h(id)})"/><polyline points="${xy}" fill="none" stroke="#e3c27a" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function ring(c) {
    const p = Math.max(0, Math.min(100, Number(c.exp) || 0)), R = 13.5, L = 2 * Math.PI * R;
    return `<div class="ov-ring" title="${c.exp != null ? c.exp.toFixed(1) + '% into level ' + c.level : ''}"><svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="${R}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="2.5"/><circle cx="15" cy="15" r="${R}" fill="none" stroke="${c.dead ? '#ec6a55' : '#e3c27a'}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${L.toFixed(1)}" stroke-dashoffset="${(L * (1 - p / 100)).toFixed(1)}"/></svg>${cls(c)}</div>`;
  }
  function partyCard(p, i) {
    const a = actOf(p.activity, p.task), lvlUp = p.members.some(m => m.lastUp && S.d.at - m.lastUp < 15 * 60000);
    const nx = p.next && p.next.status === 'ok' && p.next.at ? `<span>Party level ${p.next.next} in <b data-at="${p.next.at}"></b>${p.next.who ? ' (' + h(p.next.who) + ')' : ''}</span>` : `<span>Lowest level ${p.minLevel}${p.next && p.next.status === 'max' ? ' · max' : ' · no estimate yet'}</span>`;
    const N = (l, v, c) => `<div class="ov-n"><div class="l">${l}</div><div class="v ${c || ''}">${v}</div></div>`;
    return `<div class="ov-p ${lvlUp ? 'lvl' : ''}" style="animation-delay:${Math.min(i, 20) * 35}ms">
      <div class="ov-ph" data-ovp="${h(p.leader)}" title="Open the party on the Parties page">${IC(a.ic, '', a.n)}<div style="min-width:0"><div class="n">${h(p.leader)}</div><div class="w">${h(a.n)}${p.where && p.where !== 'GENERALZONE' ? ' · ' + h(p.where) : ''}</div></div><span class="gap"></span>
        <span class="ov-badge ${p.online === p.n ? 'ok' : 'bad'}">${p.online}/${p.n}</span>${p.dead ? `<span class="ov-badge bad">${p.dead} dead</span>` : ''}<span class="ov-badge">lvl ${p.minLevel === Math.round(p.avgLevel) ? p.minLevel : p.minLevel + '–' + Math.max(...p.members.map(m => m.level || 0))}</span></div>
      <div class="ov-nums">${N('Profit/h', sign(p.profitH), p.profitH >= 0 ? 'good' : 'bad')}${N('Exp/h', short(p.expH))}${N('Loot/h', short(p.lootH))}${N('Costs/h', short(p.costH), 'bad')}</div>
      ${sparkSvg(p)}
      <div class="ov-next">${nx}<span>${p.killsH ? p.killsH + ' kills/h' : ''}${p.deaths ? ` · <span style="color:var(--bad)">${p.deaths} deaths</span>` : ''}</span></div>
      <div class="ov-ms">${p.members.map(m => `<div class="ov-m" data-ovc="${h(m.name)}" title="${h(m.cls)} · ${h(m.task)}">${ring(m)}<div class="mi"><div class="mn">${m.leader ? '<i>★</i> ' : ''}${h(m.name)} <i>${m.level || ''}</i></div>
        <div class="me">${m.eta && m.eta.status === 'ok' && m.eta.at ? '↑ <span data-at="' + m.eta.at + '"></span>' : m.dead ? 'dead' : !m.online ? 'offline' : m.activity === 'raidcircuit' || /raid/.test(m.activity) ? 'raid' : 'no estimate'}${m.pctH ? ' · ' + m.pctH + '%/h' : m.profitH ? ' · ' + sign(m.profitH) + '/h' : ''}</div></div></div>`).join('')}</div>
      <div class="ov-more">${IC(ICO.adena)} ${short(p.adena)} adena · wallet ${sign(p.adenaH)}/h${p.levels > 0 ? ` · <span style="color:var(--gold)">+${p.levels} level${p.levels > 1 ? 's' : ''}</span>` : ''}</div></div>`;
  }
  function onClick(e) {
    const g = (s) => e.target.closest(s); let b;
    if ((b = g('[data-ovh]'))) { S.hours = Number(b.dataset.ovh); save(); renderSeg(); load(); return; }
    if ((b = g('[data-ovv]'))) { S.view = b.dataset.ovv; save(); renderSeg(); renderBody(); tickClocks(); return; }
    if ((b = g('[data-ovs]'))) { const k = b.dataset.ovs; if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = k === 'name' || k === 'eta' ? 1 : -1; } save(); renderSeg(); renderBody(); tickClocks(); return; }
    if ((b = g('[data-ovc]'))) { location.hash = '#/char/' + encodeURIComponent(b.dataset.ovc); return; }
    if ((b = g('[data-ovp]'))) { location.hash = '#/parties'; return; }
  }
  window.OverviewPage = { route, open, close };
})();
