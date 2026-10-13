// RESURRECT (owner 2026-10-13 21:00: "I need to be able to use 'Scroll of Resurrection' via an action or the Resurrection skill and then select a
// party member that is dead"). A dead member's row (Parties tab) and its character page get a "Resurrect" button; the party card shows a
// "dead" card with "Res all dead". One tap on a choice = one order:
//   Best one near (automatic)        -> party:<leader>  '!res <dead>'              (every window decides; the best resser near acts)
//   <name> — <skill | scroll | blessed> -> char:<name> '!ov <name> res <dead> <how>' (that one walks into range, targets the body, casts / reads)
//   Res all dead                     -> party:<leader>  '!resall'
// The characters report their res kit (swarm_state resKit: res skill, mass res, Scroll / Blessed Scroll counts) and what the res machinery does
// (resLive: job / after-res phase / why a body still lies there). Dialogs = the shared uidialog.js only (no browser alerts). Phone first.
// API (window.ResPanel): rowButton(c) · button(name, small) · partyHtml(leader, list) · open(dead, anchor?) · resAll(leader) · choices(dead, chars)
// Node (tests): module.exports = the same pure helpers (choices, partyInfo, sendPlan).
(function (root) {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => (Number(v) || 0);
  const kshort = (n) => { n = Math.round(num(n)); return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n); };
  const MANUAL_REACH = 12000;     // = swarm.js RESX.manualReach (an order may walk this far)
  const live = (c) => c && num(c.ageSec) <= 60;
  const dist = (a, b) => (isFinite(a.x) && isFinite(b.x) && (a.x || a.y) && (b.x || b.y) ? Math.hypot(num(a.x) - num(b.x), num(a.y) - num(b.y)) : null);
  const kitOf = (c) => { const k = c.resKit || null; return k ? { sk: k.sk || '', skReady: k.skReady !== false, mass: k.mass || '', sor: num(k.sor), bsor: num(k.bsor) } : { sk: '', skReady: false, mass: '', sor: num(c.res), bsor: 0, guess: true }; };
  const isHealer = (c) => /healer|bishop|shilliensaint/i.test(String(c.role || '') + ' ' + String(c.roleKind || ''));
  const isTank = (c) => /^(sk|tank)$/i.test(String(c.role || ''));

  /** pure: the resurrect choices for one dead member -> [{ by, how, label, sub, dist, far, ready, n }] (skills first, then nearest) */
  function choices(deadName, chars) {
    const all = chars || [], d = all.find(c => c.name === deadName); if (!d) return [];
    const out = [];
    all.filter(c => c.name !== deadName && c.party === d.party && !c.dead && live(c)).forEach(c => {
      const k = kitOf(c), m = dist(c, d), far = m != null && m > MANUAL_REACH, where = m == null ? '' : `${kshort(m)} away${far ? ' — too far, it would have to walk' : ''}`;
      if (k.sk) out.push({ by: c.name, how: 'skill', label: `${c.name} — ${k.sk}${k.skReady ? '' : ' (not ready yet)'}`, sub: where, dist: m, far, ready: k.skReady, rank: 0 });
      else if (k.mass) out.push({ by: c.name, how: 'skill', label: `${c.name} — ${k.mass}`, sub: where, dist: m, far, ready: true, rank: 0 });
      if (k.sor > 0) out.push({ by: c.name, how: 'scroll', label: `${c.name} — Scroll of Resurrection (${k.sor})${k.guess ? '' : ''}`, sub: where, dist: m, far, ready: true, n: k.sor, rank: isHealer(c) ? 3 : isTank(c) ? 2 : 1 });
      if (k.bsor > 0) out.push({ by: c.name, how: 'blessed', label: `${c.name} — Blessed Scroll of Resurrection (${k.bsor})`, sub: where, dist: m, far, ready: true, n: k.bsor, rank: (isHealer(c) ? 3 : isTank(c) ? 2 : 1) + 0.5 });
    });
    return out.sort((a, b) => (a.far - b.far) || (b.ready - a.ready) || a.rank - b.rank || num(a.dist) - num(b.dist) || a.label.localeCompare(b.label));
  }
  /** pure: what to send for a choice -> { target, cmd } */
  function sendPlan(deadName, leader, ch) {
    if (!ch || ch === 'auto') return { target: 'party:' + leader, cmd: `!res ${deadName}` };
    if (ch === 'all') return { target: 'party:' + leader, cmd: '!resall' };
    return { target: 'char:' + ch.by, cmd: `!ov ${ch.by} res ${deadName} ${ch.how}` };
  }
  /** pure: the party's res picture -> { dead: [{ name, status }], revived: [{ name, status }] } */
  function partyInfo(list) {
    const L = (list || []).filter(live), dead = [], revived = [];
    L.filter(c => c.dead).forEach(c => {
      let status = '';
      const doer = L.find(x => !x.dead && x.resLive && x.resLive.job && x.resLive.job.dead === c.name && !/^(done|failed)$/.test(x.resLive.job.phase || ''));
      if (doer) { const j = doer.resLive.job, what = j.how === 'skill' ? 'its res skill' : j.how === 'blessed' ? 'a Blessed Scroll of Resurrection' : 'a Scroll of Resurrection';
        status = `${doer.name} ${j.phase === 'walk' ? 'is walking over with' : j.phase === 'accept' ? 'used' : 'is using'} ${what}${j.phase === 'accept' ? ' — waiting for the yes' : ''}`; }
      else {
        const failed = L.find(x => x.resLive && x.resLive.job && x.resLive.job.dead === c.name && x.resLive.job.phase === 'failed');
        const w = L.map(x => x.resLive && (x.resLive.waits || []).find(y => y.dead === c.name)).find(Boolean);
        status = failed ? `${failed.name}: ${failed.resLive.job.why}` : w ? `waiting: ${w.why}` : 'no res planned yet (its party reports in a few seconds)';
      }
      dead.push({ name: c.name, status });
    });
    L.filter(c => !c.dead && c.resLive && c.resLive.after && c.resLive.after.phase !== 'done').forEach(c => {
      const a = c.resLive.after;
      revived.push({ name: c.name, status: `alive again${a.by ? ' (' + a.by + ')' : ''} — ${a.why || (a.phase === 'heal' ? 'healing the party' : 'rebuffing first')}` });
    });
    return { dead, revived };
  }
  const API = { choices, sendPlan, partyInfo, MANUAL_REACH };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }

  // ============================================================================================ browser
  const STATE_ = () => ((typeof STATE !== 'undefined' && STATE && STATE.chars) || []);
  const call = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o || {})).then(r => r.json()));
  const toast = (msg, kind) => { try { if (window.UIKit && UIKit.toast) return UIKit.toast(msg, { kind: kind || 'info' }); if (window.Override && Override.toast) return Override.toast(msg, kind === 'ok' ? true : kind === 'error' ? false : null); } catch (e) { } };
  (function css() {
    if (document.getElementById('rzCss')) return;
    const st = document.createElement('style'); st.id = 'rzCss';
    st.textContent = `.rz-btn{display:inline-flex;align-items:center;gap:4px;min-height:30px;padding:2px 10px;border:1px solid #8a6d3b;border-radius:3px;background:#3a2412;color:#ffd98a;font-weight:700;cursor:pointer;font-size:var(--fs-mini,12px);white-space:nowrap}
.rz-btn:hover,.rz-btn:focus-visible{background:#55331a;outline:2px solid #ffd98a;outline-offset:1px}.rz-btn.sm{min-height:26px;padding:1px 8px}
.rz-card{margin:4px 0;padding:6px 8px;border:1px solid #9b3b2b;border-left:4px solid #e0533a;background:rgba(80,20,14,.45);border-radius:3px}
.rz-card h3{margin:0 0 4px;font-size:var(--fs-body,14px);color:#ffb3a3}.rz-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:3px 0;border-top:1px solid rgba(255,255,255,.06)}
.rz-row:first-of-type{border-top:0}.rz-row .rz-n{font-weight:700;color:#f1e7cb}.rz-row .rz-s{flex:1 1 180px;min-width:0;color:var(--muted,#bbb);font-size:var(--fs-mini,12px)}
.rz-row.ok .rz-n{color:#9be59b}.rz-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}@media (max-width:640px){.rz-btn{min-height:36px}}`;
    document.head.appendChild(st);
  })();
  function rowButton(c) { return c && c.dead ? `<button type="button" class="rz-btn sm" data-resopen="${E(c.name)}" title="Choose who resurrects ${E(c.name)}, and how">✚ Resurrect</button>` : ''; }
  function button(name, small) { const c = STATE_().find(x => x.name === name); return c && c.dead ? `<button type="button" class="rz-btn${small ? ' sm' : ''}" data-resopen="${E(name)}" title="Choose who resurrects ${E(name)}, and how">✚ Resurrect…</button>` : ''; }
  function partyHtml(leader, list) {
    const P = partyInfo(list); if (!P.dead.length && !P.revived.length) return '';
    const rows = P.dead.map(d => `<div class="rz-row"><span class="rz-n">✝ ${E(d.name)}</span><span class="rz-s">${E(d.status)}</span><button type="button" class="rz-btn sm" data-resopen="${E(d.name)}">✚ Resurrect…</button></div>`).join('')
      + P.revived.map(d => `<div class="rz-row ok"><span class="rz-n">✚ ${E(d.name)}</span><span class="rz-s">${E(d.status)}</span></div>`).join('');
    const all = P.dead.length ? `<div class="rz-acts"><button type="button" class="rz-btn" data-resall="${E(leader)}" title="Every dead member: the best one near resurrects it (skill first, then scrolls)">✚ Res all dead (${P.dead.length})</button></div>` : '';
    return `<div class="rz-card" role="region" aria-label="Dead members of party ${E(leader)}"><h3>${P.dead.length ? `${P.dead.length} dead in party ${E(leader)}` : 'Resurrected'}</h3>${rows}${all}</div>`;
  }
  async function post(plan, label) {
    toast(`${label} — sent…`);
    try {
      const d = await call('/api/command', { method: 'POST', body: JSON.stringify({ target: plan.target, cmd: plan.cmd }) });
      if (!d || !d.ok) toast(`Not sent — ${(d && d.error) || 'no answer'}`, 'error');
      else if (d.sends && d.sends[0] && d.sends[0].ok === false && !d.sends[0].pending) toast(`${d.sends[0].error || 'failed'}`, 'error');
      else toast(`${label}: sent. The party card shows how it goes.`, 'ok');
    } catch (e) { toast(`Not sent — ${e.message}`, 'error'); }
  }
  async function open(deadName) {
    const chars = STATE_(), d = chars.find(c => c.name === deadName);
    if (!d) { await uiAlert({ title: 'Resurrect', body: `${deadName} is not reporting right now.`, kind: 'error' }); return; }
    if (!d.dead) { await uiAlert({ title: 'Resurrect', body: `${deadName} is alive.`, kind: 'info' }); return; }
    const ch = choices(deadName, chars), leader = d.party, P = partyInfo(chars.filter(c => c.party === leader)), st = (P.dead.find(x => x.name === deadName) || {}).status;
    if (!ch.length) {
      await uiAlert({ title: `Resurrect ${deadName}`, kind: 'error', body: [uiP(`Nobody alive in party ${leader} has a resurrection skill or carries a Scroll of Resurrection.`),
        uiNote('Scrolls come with the supply run (party card → Settings → Supplies, or "Supply run now"). The dead one goes to town by itself after a while when nobody can raise it.')] });
      return;
    }
    const buttons = ch.slice(0, 8).map((c, i) => ({ label: `${c.label}${c.sub ? ' · ' + c.sub : ''}`, value: i }));
    buttons.push({ label: 'Best one near (automatic)', value: 'auto', primary: true });
    const v = await uiChoice({ title: `Resurrect ${deadName}`, body: [
      uiP('Who raises ', uiEm(deadName), ', and how? One tap sends the order.'),
      st ? uiNote('Now: ', st) : '',
      uiList(['The one you pick walks to the body (also in a raid), targets it and casts the skill / reads the scroll.', `${deadName} says yes, rebuffs first${isHealer(d) ? ', heals the party' : ''}, then follows again.`, '"Best one near": a res skill first, else the nearest one with a scroll (healers and the tank last).'])] , buttons });
    if (v === null || v === undefined) return;
    if (v === 'auto') return post(sendPlan(deadName, leader, 'auto'), `Party ${leader}: resurrect ${deadName}`);
    const c = ch[v]; if (!c) return;
    const what = c.how === 'skill' ? 'its res skill' : c.how === 'blessed' ? 'a Blessed Scroll of Resurrection' : 'a Scroll of Resurrection';
    if (window.Override && Override.send) return Override.send(c.by, `res ${deadName} ${c.how}`, `resurrect ${deadName} with ${what}`);
    return post(sendPlan(deadName, leader, c), `${c.by}: resurrect ${deadName} with ${what}`);
  }
  async function resAll(leader) {
    const list = STATE_().filter(c => c.party === leader), P = partyInfo(list);
    if (!P.dead.length) { await uiAlert({ title: 'Res all dead', body: `Nobody in party ${leader} is dead right now.`, kind: 'info' }); return; }
    const ok = await uiConfirm({ title: `Res all dead — party ${leader}`, body: [uiP('Resurrect ', uiEm(P.dead.map(d => d.name).join(', ')), '.'),
      uiList(['Healers first, then the tank, then the rest.', 'A res skill first; else anyone with a Scroll of Resurrection (also in a raid — your order).', 'Each one raised rebuffs first, then follows again.']),
      uiNote('Runs up to 2 minutes; the party card shows how it goes.')], confirmText: 'Res all dead', cancelText: 'Cancel' });
    if (ok) post(sendPlan('', leader, 'all'), `Party ${leader}: res all dead`);
  }
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target : null; if (!t) return;
    const o = t.closest('[data-resopen]'); if (o) { e.preventDefault(); e.stopPropagation(); open(o.dataset.resopen); return; }
    const a = t.closest('[data-resall]'); if (a) { e.preventDefault(); e.stopPropagation(); resAll(a.dataset.resall); }
  }, true);
  root.ResPanel = Object.assign({ rowButton, button, partyHtml, open, resAll, version: '2026-10-13' }, API);
})(typeof window !== 'undefined' ? window : globalThis);
