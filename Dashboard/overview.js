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
.ov-k[data-ovk] { cursor: pointer; -webkit-tap-highlight-color: transparent; } .ov-k[data-ovk]:hover { border-color: var(--line2); }
.ov-k[data-ovk]:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; } .ov-k[data-ovk]:active { transform: scale(.98); }
.ov-k .more { position: absolute; right: 8px; top: 6px; color: var(--muted); font-size: 18px; line-height: 1; } .ov-k[data-ovk] .l { padding-right: 14px; }
/* OVDRILL-2026-10-29: the detail sheet behind a tile (bottom sheet on a phone, centred card on a desktop) */
.ovs-bg { position: fixed; inset: 0; z-index: 9000; background: rgba(0,0,0,.62); display: flex; align-items: flex-end; justify-content: center; }
.ovs { background: linear-gradient(var(--box), var(--box)), #0c1214; width: min(680px, 100%); max-height: 90vh; max-height: 90dvh; display: flex; flex-direction: column; border: 1px solid var(--line2);
  border-radius: 16px 16px 0 0; box-shadow: 0 -8px 30px rgba(0,0,0,.5); animation: ovsUp .22s ease-out; padding-bottom: env(safe-area-inset-bottom); min-width: 0; }
@media (min-width: 761px) { .ovs-bg { align-items: center; padding: 16px; } .ovs { border-radius: 16px; max-height: 84vh; } }
.ovs-h { display: flex; gap: 8px; align-items: center; padding: 10px 12px 6px; }
.ovs-h h2 { margin: 0; font-size: var(--fs-section); color: var(--gold); flex: 1; min-width: 0; display: flex; gap: 6px; align-items: center; }
.ovs-x { min-width: 44px; min-height: 44px; background: none; border: 1px solid var(--line2); border-radius: 10px; color: var(--ink); font-size: 20px; cursor: pointer; }
.ovs-x:focus-visible, .ovs .ov-seg button:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px; }
.ovs-sub { padding: 0 12px 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; color: var(--muted); font-size: var(--fs-cap); }
.ovs-b { overflow-y: auto; overflow-x: hidden; padding: 0 12px 14px; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.ovs-tot { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; background: rgba(227,194,122,.1); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; margin: 4px 0 8px; }
.ovs-tot b { font-size: 20px; color: var(--gold); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ovs-src { color: var(--muted); font-size: var(--fs-mini); margin: 0 0 8px; }
.ovs b.bad, .ovs .bad { color: var(--bad); } .ovs .good { color: var(--ok); }
.ovs h3 { margin: 12px 0 4px; font-size: var(--fs-cap); color: var(--gold); font-weight: bold; }
.ovs-l { list-style: none; margin: 0; padding: 0; }
.ovs-r { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 2px 8px; align-items: center; padding: 6px 2px; border-bottom: 1px solid rgba(255,255,255,.05); }
.ovs-r .ic { width: 28px; height: 28px; border-radius: 6px; } .ovs-r .ic.none { visibility: hidden; }
.ovs-r .m { min-width: 0; } .ovs-r .n { font-size: var(--fs-cap); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.ovs-r .n a { color: inherit; text-decoration: none; } .ovs-r .n a:hover { text-decoration: underline; }
.ovs-r .d { font-size: var(--fs-mini); color: var(--muted); overflow-wrap: anywhere; }
.ovs-r .v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: var(--fs-cap); } .ovs-r .v small { display: block; color: var(--muted); font-size: var(--fs-mini); }
.ovs-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 6px; } .ovs-chips span { border: 1px solid var(--line2); border-radius: 999px; padding: 2px 9px; font-size: var(--fs-cap); }
.ovs-chips span b { color: var(--bad); }
.ovs-note { color: var(--muted); font-size: var(--fs-mini); margin-top: 10px; }
/* OVBAG-2026-10-29: tappable character rows -> one bag (value per item, what can be sold) */
.ovs-li { list-style: none; } .ovs-tap { width: 100%; box-sizing: border-box; min-width: 0; position: relative; overflow: hidden; background: none; border: 0; border-bottom: 1px solid rgba(255,255,255,.05); color: inherit; font: inherit; text-align: left; cursor: pointer;
  min-height: 44px; grid-template-columns: auto minmax(0, 1fr) auto auto; -webkit-tap-highlight-color: transparent; }
.ovs-tap:hover { background: rgba(255,255,255,.04); } .ovs-tap:focus-visible, .ovs-bk:focus-visible, .ovs-cta a:focus-visible { outline: 2px solid var(--gold); outline-offset: -2px; }
.ovs-go { color: var(--muted); font-size: 20px; line-height: 1; }
.ovs .sr { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.ovs-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin: 2px 0 8px; }
.ovs-bk { min-height: 44px; background: none; border: 1px solid var(--line2); border-radius: 10px; color: var(--ink); font: inherit; font-size: var(--fs-cap); padding: 0 12px; cursor: pointer; }
.ovs .ov-seg button { min-height: 44px; }
.ovs-tg { display: inline-block; border: 1px solid var(--line2); border-radius: 999px; padding: 0 6px; margin: 2px 4px 0 0; font-size: var(--fs-mini); white-space: nowrap; color: var(--muted); }
.ovs-tg.sell { color: var(--ok); border-color: currentColor; } .ovs-tg.mk { color: var(--gold); border-color: currentColor; } .ovs-tg.warn { color: var(--bad); }
.ovs-tot b small { font-size: var(--fs-mini); color: var(--muted); font-weight: normal; }
.ovs-cta { background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; margin: 0 0 8px; font-size: var(--fs-cap); }
.ovs-cta a { color: var(--gold); display: inline-block; min-height: 32px; line-height: 32px; }
@keyframes ovsUp { from { transform: translateY(30px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ovs { animation: none; } }
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
    s.addEventListener('keydown', (e) => { const b = e.target.closest && e.target.closest('[data-ovk]'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSheet(b.dataset.ovk); } });   // OVDRILL
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
    s.hidden = false; S.open = true; S.order = null; window.scrollTo(0, 0);   // OVORDER: a fresh visit sorts again
    renderSeg(); load();
    clearInterval(S.poll); S.poll = setInterval(() => { if (S.open && !document.hidden) load(); }, 30000);
    clearInterval(S.tick); S.tick = setInterval(() => { if (S.open && !document.hidden) tickClocks(); }, 1000);
  }
  function close() { closeSheet(true); if (!S.open) return; S.open = false; clearInterval(S.poll); clearInterval(S.tick); const s = $id(SEC); if (s) s.hidden = true; }
  async function load() {
    const my = ++S.seq;
    // OVLOCK: exp locks from the Levels page data (/api/circuit members[].lc), refreshed every 5 min; /api/overview chars[].locked wins once the server has it
    if (!S.lkAt || Date.now() - S.lkAt > 300000) { S.lkAt = Date.now(); try { const c = await api('/api/circuit'); const L = {}; (c && c.parties ? Object.values(c.parties) : []).forEach(p => (p.members || []).forEach(m => { const l = m.lc || {}; if (l.lockOn && Number(l.lock) && Number(m.level) >= Number(l.lock)) L[m.name] = Number(l.lock); })); S.locks = L; } catch (e) { } }
    try { const d = await api('/api/overview?hours=' + S.hours); if (my !== S.seq || !d || d.error) return; S.skew = d.at - Date.now(); (d.parties || []).forEach(p => p.members.forEach(m => { if (!m.locked && S.locks && S.locks[m.name]) m.locked = S.locks[m.name]; })); const prev = S.d; S.d = d; render(prev); } catch (e) { }
  }
  function renderSeg() {
    $id('ovHours').innerHTML = [[1, 'Last hour'], [24, '24 h']].map(([v, t]) => `<button data-ovh="${v}" class="${S.hours === v ? 'on' : ''}">${t}</button>`).join('');
    $id('ovView').innerHTML = [['parties', 'Parties'], ['chars', 'Characters']].map(([v, t]) => `<button data-ovv="${v}" class="${S.view === v ? 'on' : ''}">${t}</button>`).join('');
    $id('ovSort').innerHTML = SORTS.map(([v, t]) => `<option value="${v}"${S.sort === v ? ' selected' : ''}>Sort: ${t}</option>`).join('');
  }

  // OVMORPH 2026-10-25 (owner: "it's annoying the page keeps refreshing and reloading all the time, it should just update the numbers"): a refresh
  // patches the shown cards in place (only changed text / attributes; nodes are kept, so nothing re-animates or jumps); a running clock
  // ([data-at] with the same value) keeps its text until tickClocks
  function morph(el, html) {
    const t = document.createElement('template'); t.innerHTML = html;
    if (!el.firstChild || el.dataset.ovm !== '1') { el.replaceChildren(t.content); el.dataset.ovm = '1'; return; }
    syncKids(el, t.content);
  }
  function syncKids(a, b) {
    const A = [...a.childNodes], B = [...b.childNodes];
    B.forEach((nb, i) => {
      const na = A[i];
      if (!na) { a.appendChild(nb); return; }
      if (na.nodeType !== nb.nodeType || na.nodeName !== nb.nodeName) { a.replaceChild(nb, na); return; }
      if (nb.nodeType === 3 || nb.nodeType === 8) { if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue; return; }
      if (nb.nodeType !== 1) return;
      for (const at of [...na.attributes]) if (!nb.hasAttribute(at.name) && at.name !== 'style') na.removeAttribute(at.name);
      for (const at of [...nb.attributes]) if (at.name !== 'style' && na.getAttribute(at.name) !== at.value) na.setAttribute(at.name, at.value);   // style = the entry animation delay only
      if (na.hasAttribute('data-at') && na.getAttribute('data-at') === nb.getAttribute('data-at') && !nb.firstChild) return;
      syncKids(na, nb);
    });
    for (let i = A.length - 1; i >= B.length; i--) A[i].remove();
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
    // OVDRILL-2026-10-29: every tile is a button that opens the rows behind it (openSheet)
    if (box.children.length !== K.length) box.innerHTML = K.map(([k], i) => `<div class="ov-k" data-k="${k}" data-ovk="${k}" role="button" tabindex="0" aria-haspopup="dialog" style="animation-delay:${i * 60}ms"><span class="more" aria-hidden="true">›</span><div class="l"></div><div class="v"></div><div class="s"></div></div>`).join('');
    K.forEach(([k, l, ic, v, fmt, c, s], i) => { const el = box.children[i]; el.className = 'ov-k ' + c; el.querySelector('.l').innerHTML = IC(ic) + h(l); countUp(el.querySelector('.v'), Number(v) || 0, fmt); el.querySelector('.s').textContent = s;
      el.setAttribute('aria-label', `${l}: ${fmt(Number(v) || 0)}, ${s}. Show where it comes from`); });
    morph($id('ovSoon'), d.soon.length ? d.soon.map(c => `<div class="ov-chip" data-ovc="${h(c.name)}" title="${h(c.party)}">${cls(c)}<b>${h(c.name)}</b> → ${c.level + 1} <span class="t" data-at="${c.at}"></span></div>`).join('') : '<span class="ov-note">No estimate yet — needs a few minutes of hunting.</span>');
    morph($id('ovUps'), d.ups.length ? d.ups.map(c => `<div class="ov-chip ${d.at - c.at < 15 * 60000 ? 'up' : ''}" data-ovc="${h(c.name)}">${cls(c)}<b>${h(c.name)}</b> reached ${c.level} <span class="t">${ago(c.at)}</span></div>`).join('') : '<span class="ov-note">No level-up in the last 6 hours.</span>');
    // confetti for a level-up that appeared since the last refresh
    if (prev && !reduce()) for (const c of d.ups) if (!prev.ups.some(p => p.name === c.name && p.at === c.at) && d.at - c.at < 10 * 60000) confetti($id('ovUps'));
    renderBody(true); tickClocks();
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
  // OVORDER 2026-10-25: an automatic refresh keeps the order on screen (cards no longer swap places every 30 s as profit moves);
  // the sort is applied again only when you change it, search, switch view or open the page
  const keepOrder = (list, keyOf, auto) => {
    const ord = S.order && S.order.view === S.view ? S.order.keys : null;
    if (auto && ord) { const ix = new Map(ord.map((k, i) => [k, i])); list.sort((a, b) => (ix.has(keyOf(a)) ? ix.get(keyOf(a)) : 1e6) - (ix.has(keyOf(b)) ? ix.get(keyOf(b)) : 1e6)); }
    else list.sort(sorter);
    S.order = { view: S.view, keys: list.map(keyOf) };
    return list;
  };
  function renderBody(auto) {
    const d = S.d; if (!d) return;
    const q = S.q, body = $id('ovBody');
    if (S.view === 'chars') {
      const list = keepOrder(d.chars.filter(c => !q || c.name.toLowerCase().includes(q) || c.party.toLowerCase().includes(q) || String(c.cls).toLowerCase().includes(q)), c => c.name, auto);
      const cols = [['name', 'Character'], ['level', 'Level'], ['eta', 'Next level'], ['expH', 'Exp / h'], ['profitH', 'Profit / h'], ['lootH', 'Loot / h'], ['costH', 'Costs / h'], ['adena', 'Adena'], ['killsH', 'Kills / h'], ['deaths', 'Deaths']];
      morph(body, `<div class="ov-twrap"><table class="ov-t"><thead><tr>${cols.map(([k, t]) => `<th data-ovs="${k}" class="${S.sort === k ? 'on' : ''}">${t}${S.sort === k ? (S.dir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>${list.map((c, i) => {
        const a = actOf(c.activity, c.task);
        return `<tr data-ovc="${h(c.name)}" style="animation-delay:${Math.min(i, 30) * 15}ms"><td><span class="ov-dot ${c.dead ? 'dead' : c.online ? '' : 'off'}"></span> ${cls(c)} <b>${h(c.name)}</b> ${IC(a.ic, '', a.n)} <span class="ov-badge">${h(c.party)}</span></td>
          <td data-l="Level">${c.level || '—'} <span class="ov-badge">${c.exp != null ? c.exp.toFixed(1) + '%' : ''}</span></td><td data-l="Next level"><span data-at="${c.eta && c.eta.status === 'ok' && c.eta.at ? c.eta.at : ''}"></span></td>
          <td data-l="Exp / h">${c.expH != null ? short(c.expH) : '—'}${c.pctH != null ? ` <span class="ov-badge">${c.pctH}%</span>` : ''}</td><td data-l="Profit / h"><span class="${c.profitH >= 0 ? 'good' : 'bad'}">${sign(c.profitH)}</span></td>
          <td data-l="Loot / h">${short(c.lootH)}</td><td data-l="Costs / h"><span class="bad">${short(c.costH)}</span></td><td data-l="Adena">${short(c.adena)}</td><td data-l="Kills / h">${c.killsH != null ? c.killsH : '—'}</td><td data-l="Deaths">${c.deaths ? `<span class="bad">${c.deaths}</span>` : 0}</td></tr>`;
      }).join('')}</tbody></table></div>`);
      return;
    }
    const parties = keepOrder(d.parties.filter(p => !q || p.leader.toLowerCase().includes(q) || p.members.some(m => m.name.toLowerCase().includes(q))), p => p.leader, auto);
    morph(body, `<div class="ov-grid">${parties.map((p, i) => partyCard(p, i)).join('')}</div>`);
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
  // OVLOCK 2026-10-25: why there is no level-up time (exp locked on purpose / raid / waiting / travelling / no exp yet) instead of "no estimate yet"
  function noEta(p) {
    const ms = p.members, lk = ms.map(m => m.locked).filter(Boolean);
    if (lk.length && lk.length === ms.length) return 'exp locked at ' + Math.min(...lk) + ' (farming)';
    if (p.activity === 'raidcircuit' || /raid/.test(p.activity || '')) return 'raid circuit (no exp)';
    if (/^waiting for orders/i.test(p.task || '')) return 'waiting for orders';
    if (/^(route to|travel|walking|dungeon: |teleport)/i.test(p.task || '')) return 'travelling';
    if (ms.some(m => m.eta && m.eta.status === 'warmup')) return 'measuring…';
    if (ms.some(m => m.eta && m.eta.status === 'idle')) return 'no exp for a while';
    return 'no exp in the last minutes';
  }
  function partyCard(p, i) {
    const a = actOf(p.activity, p.task), lvlUp = p.members.some(m => m.lastUp && S.d.at - m.lastUp < 15 * 60000);
    const nx = p.next && p.next.status === 'ok' && p.next.at ? `<span>Party level ${p.next.next} in <b data-at="${p.next.at}"></b>${p.next.who ? ' (' + h(p.next.who) + ')' : ''}</span>` : `<span>Lowest level ${p.minLevel} · ${p.next && p.next.status === 'max' ? 'max' : noEta(p)}</span>`;
    const N = (l, v, c) => `<div class="ov-n"><div class="l">${l}</div><div class="v ${c || ''}">${v}</div></div>`;
    return `<div class="ov-p ${lvlUp ? 'lvl' : ''}" style="animation-delay:${Math.min(i, 20) * 35}ms">
      <div class="ov-ph" data-ovp="${h(p.leader)}" title="Open this party's page">${IC(a.ic, '', a.n)}<div style="min-width:0"><div class="n">${h(p.leader)}</div><div class="w">${h(a.n)}${p.where && p.where !== 'GENERALZONE' ? ' · ' + h(p.where) : ''}</div></div><span class="gap"></span>
        <span class="ov-badge ${p.online === p.n ? 'ok' : 'bad'}">${p.online}/${p.n}</span>${p.dead ? `<span class="ov-badge bad">${p.dead} dead</span>` : ''}<span class="ov-badge">lvl ${p.minLevel === Math.round(p.avgLevel) ? p.minLevel : p.minLevel + '–' + Math.max(...p.members.map(m => m.level || 0))}</span></div>
      <div class="ov-nums">${N('Profit/h', sign(p.profitH), p.profitH >= 0 ? 'good' : 'bad')}${N('Exp/h', short(p.expH))}${N('Loot/h', short(p.lootH))}${N('Costs/h', short(p.costH), 'bad')}</div>
      ${sparkSvg(p)}
      <div class="ov-next">${nx}<span>${p.killsH ? p.killsH + ' kills/h' : ''}${p.deaths ? ` · <span style="color:var(--bad)">${p.deaths} deaths</span>` : ''}</span></div>
      <div class="ov-ms">${p.members.map(m => `<div class="ov-m" data-ovc="${h(m.name)}" title="${h(m.cls)} · ${h(m.task)}">${ring(m)}<div class="mi"><div class="mn">${m.leader ? '<i>★</i> ' : ''}${h(m.name)} <i>${m.level || ''}</i></div>
        <div class="me">${m.eta && m.eta.status === 'ok' && m.eta.at ? '↑ <span data-at="' + m.eta.at + '"></span>' : m.dead ? 'dead' : !m.online ? 'offline' : m.locked ? 'exp locked ' + m.locked : m.activity === 'raidcircuit' || /raid/.test(m.activity) ? 'raid' : 'no exp now'}${m.pctH ? ' · ' + m.pctH + '%/h' : m.profitH ? ' · ' + sign(m.profitH) + '/h' : ''}</div></div></div>`).join('')}</div>
      <div class="ov-more">${IC(ICO.adena)} ${short(p.adena)} adena · wallet ${sign(p.adenaH)}/h${p.levels > 0 ? ` · <span style="color:var(--gold)">+${p.levels} level${p.levels > 1 ? 's' : ''}</span>` : ''}</div></div>`;
  }
  // OVDRILL-2026-10-29 (owner: "19 deaths in the last hour. But I don't know who keeps dying I need a report ... click the gold button and SEE what
  // all of these values comes from in the bags"): a tile opens a sheet with the rows behind it, for Last hour / 24 h; the numbers add up to the
  // tile (rounding said). deaths / adena / loot / costs come from /api/overview?detail=<kind> (the same build as the tile); profit / exp / online
  // from the overview payload. Own sheet (UIDialog renders text blocks only): role=dialog aria-modal, Esc / backdrop / ✕ close, focus trap,
  // focus back to the tile. Read only (GET).
  const SH = { el: null, kind: '', hours: 1, from: null, seq: 0, bag: '', all: false, bf: 'all' };   // OVBAG: bag = the character whose bag is open, all = "All bags", bf = all | sell
  const full = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
  const hm = (t) => { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const TITLE = { profitH: ['Profit', ICO.profit], expH: ['Experience', ICO.exp], adena: ['Adena (all bags)', ICO.adena], lootH: ['Loot worth', ICO.loot], costH: ['Costs', ICO.cost], killsH: ['Kills & deaths', ICO.dead], online: ['Online', ICO.online] };
  const rowIn = (ic, name, sub, val, valSub) => `${ic ? IC(ic, 'ic') : '<span class="ic none"></span>'}<div class="m"><div class="n">${name}</div>${sub ? `<div class="d">${sub}</div>` : ''}</div><div class="v">${val}${valSub ? `<small>${valSub}</small>` : ''}</div>`;
  const row = (ic, name, sub, val, valSub) => `<li class="ovs-r">${rowIn(ic, name, sub, val, valSub)}</li>`;
  const rowB = (nm, ic, name, sub, val, valSub) => `<li class="ovs-li"><button type="button" class="ovs-r ovs-tap" data-ovbag="${h(nm)}">${rowIn(ic, name + '<span class="sr">, show the bag</span>', sub, val, valSub)}<span class="ovs-go" aria-hidden="true">›</span></button></li>`;   // OVBAG
  const who = (n) => `<a href="#/char/${encodeURIComponent(n)}" data-ovsgo="1">${h(n)}</a>`;
  const tot = (label, v) => `<div class="ovs-tot"><span>${label}</span><b>${v}</b></div>`;
  function openSheet(kind) {
    if (!TITLE[kind]) return;
    closeSheet(true);
    SH.kind = kind; SH.hours = S.hours; SH.bag = ''; SH.all = false; SH.bf = 'all'; SH.from = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.querySelector(`[data-ovk="${kind}"]`);
    const bg = document.createElement('div'); bg.className = 'ovs-bg'; bg.id = 'ovSheet';
    bg.innerHTML = `<div class="ovs" role="dialog" aria-modal="true" aria-labelledby="ovsT"><div class="ovs-h"><h2 id="ovsT"></h2><button type="button" class="ovs-x" data-ovsx="1" aria-label="Close">✕</button></div>
      <div class="ovs-sub"><div class="ov-seg" id="ovsHours" role="group" aria-label="Time window"></div><span id="ovsAt" aria-live="polite"></span></div><div class="ovs-b" id="ovsBody" tabindex="-1"></div></div>`;
    document.body.appendChild(bg); SH.el = bg; document.documentElement.style.overflow = 'hidden';
    bg.addEventListener('click', (e) => {
      if (e.target === bg || e.target.closest('[data-ovsx]')) { closeSheet(); return; }
      const hb = e.target.closest('[data-ovsh]'); if (hb) { SH.hours = Number(hb.dataset.ovsh); fillSheet(); return; }
      if (e.target.closest('[data-ovsgo]')) { closeSheet(true); return; }   // a character link: the page changes, focus is not given back
      const bb = e.target.closest('[data-ovbag]'); if (bb) { SH.bag = bb.dataset.ovbag; SH.bf = 'all'; fillSheet(true); return; }   // OVBAG: a character row -> its bag
      if (e.target.closest('[data-ovsback]')) { bagBack(); return; }
      const keep = (sel) => fillSheet().then(() => { const x = SH.el && SH.el.querySelector(sel); if (x) x.focus(); });   // focus stays on the pressed toggle
      const ab = e.target.closest('[data-ovsall]'); if (ab) { SH.all = ab.dataset.ovsall === '1'; keep(`[data-ovsall="${ab.dataset.ovsall}"]`); return; }
      const fb = e.target.closest('[data-ovsbf]'); if (fb) { SH.bf = fb.dataset.ovsbf; keep(`[data-ovsbf="${fb.dataset.ovsbf}"]`); return; }
    });
    bg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (SH.bag) bagBack(); else closeSheet(); return; }   // OVBAG: Esc in a bag = back to the list
      if (e.key !== 'Tab') return;
      const f = [...bg.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    fillSheet(); bg.querySelector('.ovs-x').focus();
  }
  function closeSheet(quiet) {
    if (!SH.el) return; SH.el.remove(); SH.el = null; SH.seq++; document.documentElement.style.overflow = '';
    if (!quiet && SH.from && document.contains(SH.from)) try { SH.from.focus(); } catch (e) { }
  }
  function bagBack() { const n = SH.bag; SH.bag = ''; fillSheet().then(() => { const b = SH.el && [...SH.el.querySelectorAll('[data-ovbag]')].find(x => x.dataset.ovbag === n); if (b) b.focus(); }); }
  async function fillSheet(focusBody) {
    const my = ++SH.seq, k = SH.kind, hrs = SH.hours, [title, ic] = TITLE[k], body = $id('ovsBody');
    $id('ovsHours').hidden = !!SH.bag;   // OVBAG: a bag has no time window
    if (SH.bag) {
      $id('ovsT').innerHTML = IC(ICO.adena) + h(SH.bag) + '’s bag'; body.innerHTML = '<p class="ovs-note">Loading…</p>';
      let d = null; try { d = await api('/api/overview?detail=bag&name=' + encodeURIComponent(SH.bag)); } catch (e) { }
      if (my !== SH.seq || !SH.el) return;
      $id('ovsAt').textContent = d && d.at ? 'bag read ' + ago(d.at) : '';
      body.innerHTML = d && d.ok ? bagHtml(d) : `<div class="ovs-bar"><button type="button" class="ovs-bk" data-ovsback="1">‹ All characters</button></div><p class="ovs-note">Could not load the bag${d && d.error ? ': ' + h(d.error) : ''}.</p>`;
      if (focusBody) { const b = body.querySelector('[data-ovsback]'); if (b) b.focus(); }
      return;
    }
    $id('ovsT').innerHTML = IC(ic) + h(title) + ' · ' + (hrs === 1 ? 'last hour' : 'last 24 h');
    $id('ovsHours').innerHTML = [[1, 'Last hour'], [24, '24 h']].map(([v, t]) => `<button type="button" data-ovsh="${v}" class="${hrs === v ? 'on' : ''}" aria-pressed="${hrs === v}">${t}</button>`).join('');
    body.innerHTML = '<p class="ovs-note">Loading…</p>';
    let d = null, P = null;
    try {
      if (['deaths', 'adena', 'loot', 'costs'].includes(DK[k])) d = await api(`/api/overview?hours=${hrs}&detail=${DK[k]}`);
      P = hrs === S.hours && S.d ? S.d : await api('/api/overview?hours=' + hrs);
    } catch (e) { }
    if (my !== SH.seq || !SH.el) return;
    if (!P || P.error || (DK[k] && (!d || d.ok === false))) { body.innerHTML = `<p class="ovs-note">Could not load the details${d && d.error ? ': ' + h(d.error) : ''}. Try again in a moment.</p>`; return; }
    $id('ovsAt').textContent = 'as of ' + hm(P.at);
    try { body.innerHTML = SHEET[k](d, P, hrs); } catch (e) { body.innerHTML = '<p class="ovs-note">Could not show the details.</p>'; }
  }
  // OVBAG-2026-10-29: one bag — every item with its shop value, marked worn / quest / adena / kept / no shop / can sell + where it is on the sell list
  function bagHtml(d) {
    const tg = (t, c) => `<span class="ovs-tg${c ? ' ' + c : ''}">${h(t)}</span>`, LIST = { all: 'marked to sell · all bots', char: 'marked to sell · this character', keep: 'on the keep list' };
    const rs = SH.bf === 'sell' ? d.rows.filter(r => r.sell) : d.rows;
    const tags = (r) => (r.sell ? tg('can sell', 'sell') + (r.enU ? tg('check +enchant first', 'warn') : '') : tg(r.why, '')) + (r.list ? tg(LIST[r.list], 'mk') : '');
    const each = (r) => r.adena ? 'coins' : r.noShop ? `no shop buys it${r.each ? ' (list ' + full(r.each) + ')' : ''}` : `${full(r.count)} × ${full(r.each)}`;
    return `<div class="ovs-bar"><button type="button" class="ovs-bk" data-ovsback="1">‹ All characters</button>
        <div class="ov-seg" role="group" aria-label="Show">${[['all', 'Every item'], ['sell', 'Can sell']].map(([v, t]) => `<button type="button" data-ovsbf="${v}" class="${SH.bf === v ? 'on' : ''}" aria-pressed="${SH.bf === v}">${t}</button>`).join('')}</div></div>
      <p class="ovs-src">${h(d.source)}</p>
      ${tot('Bag worth (items + coins)', full(d.total))}${tot('Can sell', `<span class="good">${full(d.sellable)}</span> <small>${d.nSell} kinds</small>`)}${tot('Adena', full(d.adena))}
      <p class="ovs-cta">To sell: mark items on the character page (Inventory → Mark junk). <a href="#/char/${encodeURIComponent(d.name)}" data-ovsgo="1">Open ${h(d.name)} ›</a>${d.marked ? ` · ${d.marked} kind${d.marked > 1 ? 's' : ''} here ${d.marked > 1 ? 'are' : 'is'} already marked.` : ''}</p>
      ${rs.length ? `<ul class="ovs-l" aria-label="Items">${rs.map(r => row(r.icon || '', h(r.name) + (r.enchant ? ` <small>+${r.enchant}</small>` : ''), each(r) + '<br>' + tags(r), full(r.value))).join('')}</ul>` : '<p class="ovs-note">Nothing to sell in this bag.</p>'}
      <p class="ovs-note">${h(d.rule)} The bag file has no enchant level: before marking a gear piece, check it shows no +N on the character page. Sum of the rows = ${full(d.rows.reduce((t, r) => t + r.value, 0))} = bag worth.</p>`;
  }
  const DK = { killsH: 'deaths', adena: 'adena', lootH: 'loot', costH: 'costs' };
  const SHEET = {
    killsH(d, P, hrs) {
      const T = P.total, rows = d.rows || [];
      const place = (r) => { const t = String(r.task || '').replace(/^(autolevel|hunting|raid|circuit|route to|travel|quest):\s*/i, '').split(' · ')[0]; return h(t || 'place not logged') + (r.x != null ? ` <span>(${r.x}, ${r.y})</span>` : ''); };
      return `${tot(`Kills ${hrs === 1 ? 'per hour' : 'per hour (24 h avg)'}`, full(T.killsH))}
        ${tot(`Deaths in the ${hrs === 1 ? 'last hour' : 'last 24 h'}`, `<span class="${rows.length ? 'bad' : ''}">${rows.length}</span>`)}
        ${rows.length ? `<h3>Who died (most first)</h3><div class="ovs-chips">${d.byChar.map(c => `<span>${h(c.name)} <b>${c.n}</b> <small>${h(c.party)}</small></span>`).join('')}</div>
        <h3>Every death (newest first)</h3><ul class="ovs-l">${rows.map(r => row(ICO.dead, `${who(r.name)} <small>lvl ${r.level || '?'} · ${h(r.party)}</small>`,
          `${place(r)}${r.killer ? ` · killed by <b class="bad">${h(r.killer)}</b>` : ' · killer not logged'}${r.resBy ? ` · raised by ${h(r.resBy)}` : r.town ? ' · got up in town' : r.revivedAt ? '' : ' · not revived yet'}`,
          (r.approx ? '~' : '') + hm(r.at), r.revivedAt ? 'up ' + hm(r.revivedAt) : '')).join('')}</ul>`
        : '<p class="ovs-note">Nobody died in this window.</p>'}
        <h3>Kills per hour by party</h3><ul class="ovs-l">${P.parties.slice().sort((a, b) => b.killsH - a.killsH).map(p => row(ICO.kills, h(p.leader), `${p.n} characters${p.deaths ? ` · <span class="bad">${p.deaths} deaths</span>` : ''}`, full(p.killsH))).join('')}</ul>
        <p class="ovs-note">${h(d.note)} Place = what it was doing + x, y (a res = where it fell; a town respawn = the last place before).</p>`;
    },
    adena(d) {   // OVBAG-2026-10-29: Coins | All bags (sellable worth per character); every row opens that character's bag
      const seg = `<div class="ovs-bar"><div class="ov-seg" role="group" aria-label="Show">${[['0', 'Coins'], ['1', 'All bags: can sell']].map(([v, t]) => `<button type="button" data-ovsall="${v}" class="${SH.all === (v === '1') ? 'on' : ''}" aria-pressed="${SH.all === (v === '1')}">${t}</button>`).join('')}</div></div>`;
      const bagLine = (b) => b ? `bag worth ${short(b.value)} · can sell ${short(b.sell)}` : 'no bag read yet';
      if (SH.all) {
        const rs = d.rows.slice().sort((a, b) => ((b.bag || {}).sell || 0) - ((a.bag || {}).sell || 0) || a.name.localeCompare(b.name)), S_ = rs.reduce((t, r) => t + ((r.bag || {}).sell || 0), 0), V = rs.reduce((t, r) => t + ((r.bag || {}).value || 0), 0);
        return `${seg}<p class="ovs-src">What an NPC shop would pay for the items each character could sell (not worn, not quest, not enchanted, not kept). Tap a character for its items.</p>
          ${tot('Can sell, all bags', full(S_))}${tot('Bag worth, all bags (items + coins)', full(V))}
          <ul class="ovs-l">${rs.map(r => rowB(r.name, ICO.loot, h(r.name) + ` <small>${h(r.party)}</small>`, r.bag ? `${r.bag.n} item kinds to sell · bag worth ${short(r.bag.value)} · coins ${short(r.adena)}${r.bag.at ? ' · read ' + ago(r.bag.at) : ''}` : 'no bag read yet', r.bag ? full(r.bag.sell) : '—')).join('')}</ul>
          <p class="ovs-note">Sum of the rows = ${full(S_)}. Bags = the bots' last bag read (Logs/bag_&lt;name&gt;.json).</p>`;
      }
      return `${seg}<p class="ovs-src"><b>Coins only</b> — the adena in each character's bag right now. Items are not counted here; tap a character for its bag worth and what can be sold.</p>
        ${tot('All bags', full(d.total))}
        <ul class="ovs-l">${d.rows.map(r => rowB(r.name, ICO.adena, h(r.name) + ` <small>${h(r.party)}</small>`, (r.change != null ? `change in the window <span class="${r.change >= 0 ? 'good' : 'bad'}">${r.change >= 0 ? '+' : '−'}${full(Math.abs(r.change))}</span>` : 'no recorder samples yet') + ' · ' + bagLine(r.bag), full(r.adena))).join('')}</ul>
        <p class="ovs-note">Sum of the rows = ${full(d.sum)} = the tile (exact). ${h(d.note)}</p>`;
    },
    lootH(d, P, hrs) {
      return `<p class="ovs-src">${h(d.source)}</p>
        ${tot('Worth looted in the window', full(d.worth))}${hrs === 24 ? tot('÷ 24 h = the tile', full(d.totalH) + ' / h') : ''}
        ${d.rows.length ? `<ul class="ovs-l">${d.rows.map(r => row(r.icon || '', `${h(r.name)}${r.grade && r.grade !== 'NONE' ? ` <small>${h(r.grade)}</small>` : ''}`, `${full(r.count)} × ${r.each ? full(r.each) : '<span>no shop price</span>'}${r.spoiled ? ` · ${full(r.spoiled)} spoiled` : ''}`, full(r.value))).join('')}</ul>` : '<p class="ovs-note">Nothing looted in this window.</p>'}
        ${d.others ? `<p class="ovs-note">− ${full(d.others)} of it was looted by characters not on this page (not in the tile).</p>` : ''}
        <p class="ovs-note">Items count at this price until sold. ${h(d.round)}; the tile is the sum per character${hrs === 24 ? ' ÷ 24' : ''}.</p>`;
    },
    costH(d, P, hrs) {
      const u = d.items.reduce((t, i) => t + i.value, 0), g = d.buys.reduce((t, b) => t + b.v, 0);
      return `<p class="ovs-src">${h(d.source)}</p>
        ${tot('Costs in the window', full(u + g))}${hrs === 24 ? tot('÷ 24 h = the tile', full(d.totalH) + ' / h') : ''}
        <h3>Shots, potions, ore used · ${full(u)}</h3>${d.items.length ? `<ul class="ovs-l">${d.items.map(i => row(i.icon || '', h(i.name), `${full(i.count)} × ${full(i.each)}`, full(i.value))).join('')}</ul>` : '<p class="ovs-note">No use recorded.</p>'}
        <h3>Gear & player-shop buys · ${full(g)}</h3>${d.buys.length ? `<ul class="ovs-l">${d.buys.map(b => row('', h(b.name), `${who(b.who)} · ${h(b.kind)} · ${hm(b.at)}`, full(b.v))).join('')}</ul>` : '<p class="ovs-note">Nothing bought.</p>'}
        ${d.byChar.length ? `<h3>By character</h3><ul class="ovs-l">${d.byChar.map(c => row('', who(c.name) + ` <small>${h(c.party)}</small>`, `used ${full(c.use)} · bought ${full(c.gear)}`, full(c.use + c.gear))).join('')}</ul>` : ''}
        <p class="ovs-note">Already paid from the wallets (inside the wallet change). Counts of a part-hour are pro-rated. ${h(d.round)}.</p>`;
    },
    profitH(d, P) {
      const ps = P.parties.slice().sort((a, b) => b.profitH - a.profitH);
      return `${tot('Profit per hour', `<span class="${P.total.profitH >= 0 ? 'good' : 'bad'}">${sign(P.total.profitH)}</span>`)}
        <p class="ovs-src">Profit = wallet change + loot worth (items at shop price until sold).</p>
        <ul class="ovs-l">${ps.map(p => row(ICO.party, h(p.leader), `wallet ${sign(p.adenaH)} + loot ${short(p.lootH)} · ${p.n} characters`, `<span class="${p.profitH >= 0 ? 'good' : 'bad'}">${full(p.profitH)}</span>`)).join('')}</ul>
        <p class="ovs-note">Rows are per party per hour; their sum ${full(ps.reduce((t, p) => t + p.profitH, 0))} = the tile.</p>`;
    },
    expH(d, P) {
      const cs = P.chars.slice().sort((a, b) => (b.expH || 0) - (a.expH || 0));
      return `${tot('Experience per hour', full(P.total.expH))}
        <ul class="ovs-l">${cs.map(c => row('', who(c.name) + ` <small>lvl ${c.level || '?'} · ${h(c.party)}</small>`, `${c.pctH != null ? c.pctH + '% / h' : c.locked ? 'exp locked ' + c.locked : 'no exp now'}${c.levels > 0 ? ` · <span class="good">+${c.levels} level</span>` : ''}`, c.expH != null ? full(c.expH) : '—')).join('')}</ul>
        <p class="ovs-note">Sum of the rows = ${full(cs.reduce((t, c) => t + (Number(c.expH) || 0), 0))} = the tile.</p>`;
    },
    online(d, P) {
      return `${tot('Online now', `${P.total.online} / ${P.total.n}`)}
        <ul class="ovs-l">${P.parties.map(p => { const off = p.members.filter(m => !m.online).map(m => m.name), dead = p.members.filter(m => m.dead).map(m => m.name);
          return row(ICO.online, h(p.leader), `${off.length ? 'offline: ' + off.map(h).join(', ') : 'all online'}${dead.length ? ` · <span class="bad">dead: ${dead.map(h).join(', ')}</span>` : ''}`, `<span class="${p.online === p.n ? 'good' : 'bad'}">${p.online} / ${p.n}</span>`); }).join('')}</ul>
        <p class="ovs-note">Online = the bot wrote its state in the last 30 s.</p>`;
    },
  };

  function onClick(e) {
    const g = (s) => e.target.closest(s); let b;
    if ((b = g('[data-ovk]'))) { openSheet(b.dataset.ovk); return; }   // OVDRILL-2026-10-29
    if ((b = g('[data-ovh]'))) { S.hours = Number(b.dataset.ovh); save(); renderSeg(); load(); return; }
    if ((b = g('[data-ovv]'))) { S.view = b.dataset.ovv; save(); renderSeg(); renderBody(); tickClocks(); return; }
    if ((b = g('[data-ovs]'))) { const k = b.dataset.ovs; if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = k === 'name' || k === 'eta' ? 1 : -1; } save(); renderSeg(); renderBody(); tickClocks(); return; }
    if ((b = g('[data-ovc]'))) { location.hash = '#/char/' + encodeURIComponent(b.dataset.ovc); return; }
    if ((b = g('[data-ovp]'))) { location.hash = '#/party/' + encodeURIComponent(b.dataset.ovp); return; }   // PARTYPAGE 2026-10-25: that party's own page
  }
  window.OverviewPage = { route, open, close };
})();
