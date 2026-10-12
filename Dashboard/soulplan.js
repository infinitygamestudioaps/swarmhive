// SOUL CRYSTAL STAGE PLAN (2026-10-12, forum topic 503 + L2J H5 levelUpCrystalData.xml): a "Stage plan" box at the bottom of the Crystals tab.
// Per character with a crystal or a target (Logs/soul_<name>.json): stage by stage which monsters (chance, area, landing) or raid bosses
// (red = every party member, yellow = each member rolls, green = one random member; forum colours) level it, and the Alexandria shortcut.
// Custom form for any crystal. Data: GET /api/soulstageplan (Dashboard/soulplan_api.js, read-only). Plan logic: Dashboard/soullogic.js.
(function () {
  'use strict';
  const ID = 'scStagePlan';
  const S = { d: null, at: 0, busy: false, sel: '', custom: null, cplan: null, err: '' };
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // the page's own api() (sends the x-key header); a plain fetch only when this file runs without index.html
  const get = async (q) => { const u = '/api/soulstageplan' + (q ? '?' + q : ''); if (typeof api === 'function') return api(u); const r = await fetch(u, { cache: 'no-store' }); return r.json(); };
  const ABS = { FULL_PARTY: ['red', 'every party member rolls'], PARTY_RANDOM: ['yellow', 'each member has a random chance'], PARTY_ONE_RANDOM: ['green', 'one random party member'], LAST_HIT: ['', 'only the killer (use the crystal below 50 % HP)'] };
  const colorDot = (c) => `<span class="sp-dot sp-${h(c)}" aria-hidden="true"></span>`;
  const costTxt = (cost) => (cost || []).map(c => `${h(c.count)} ${h(c.name || ('item ' + c.id))}`).join(' + ');
  function stepHtml(st) {
    const mobs = (st.mobs || []).map(m => `<li><b>${h(m.name)}</b> L${h(m.level)} · ${h(m.pct)} %${m.aggressive ? ' · <span class="sp-ag">aggressive</span>' : ''}${m.where ? ` · ${h(m.where.area)}${m.where.landing ? ` <span class="muted">(${h(m.where.landing)}${m.where.walk ? ', walk ~' + Math.round(m.where.walk / 100) / 10 + 'k' : ''})</span>` : ''}` : ''}</li>`).join('');
    const bosses = (st.bosses || []).map(b => { const a = ABS[b.absorb] || ['', b.absorb]; return `<li>${a[0] ? colorDot(a[0]) : ''}<b>${h(b.name)}</b> L${h(b.level)} · ${h(b.pct)} % · <span class="muted">${h(a[1])}</span>${b.where && b.where.area ? ' · ' + h(b.where.area) : ''}</li>`; }).join('');
    const how = { monsters: 'hunt monsters', boss: 'raid boss', 'party boss': 'party raid boss (healer)', buy: 'buy at Alexandria', trade: 'trade / buy (healers never land the killing blow)', none: 'no source known' }[st.method] || st.method;
    return `<div class="sp-step"><div class="sp-sh"><b>${h(st.stage)} → ${h(st.to)}</b> <span class="sp-how">${h(how)}</span>${st.kills ? ` <span class="muted">~${h(st.kills)} uses</span>` : ''}${st.buy ? ` <span class="sp-buy">Alexandria: ${costTxt(st.buy.cost)}</span>` : ''}</div>
      ${mobs ? `<div class="sp-k">Monsters (killer's crystal only):</div><ul class="sp-ul">${mobs}</ul>` : ''}${bosses ? `<div class="sp-k">Raid bosses:</div><ul class="sp-ul">${bosses}</ul>` : ''}</div>`;
  }
  function planHtml(p) {
    if (!p) return '<div class="muted">No colour chosen yet (no crystal and no target).</div>';
    if (!p.steps || !p.steps.length) return `<div class="muted">Nothing to level (${h(p.from)} → ${h(p.to)}).</div>`;
    const sc = p.buy ? `<div class="sp-short">Shortcut: buy a stage ${h(p.buy.stage)} ${h(p.color)} crystal at <b>Alexandria</b> (Giran) for ${costTxt(p.buy.cost)} — skips ${h(p.buy.skips)} stage(s). Grade crystals, not adena; quest 350 must be started and it must be the only crystal in the bag.</div>` : '';
    return sc + p.steps.map(stepHtml).join('');
  }
  function charHtml(c) {
    const now = c.crystal ? `${colorDot(c.crystal.color)}${h(c.crystal.color)} stage ${h(c.crystal.stage)}${c.crystals > 1 ? ' <span class="bad">· ' + h(c.crystals) + ' crystals: nothing absorbs (resonation)</span>' : ''}` : '<span class="muted">no crystal</span>';
    const tg = c.target ? `→ stage ${h(c.target.stage)} ${h(c.target.color)} for <b>${h(c.target.sa)}</b> on ${h(c.target.weapon)} (${h(c.target.grade)})` : '';
    const warn = [c.level < 40 ? 'crystals level from character level 40' : '', c.healer ? 'healer: monsters never level its crystal (only the killer\'s rolls) — party bosses, buy or trade' : '',
      c.quest350 === false ? 'quest 350 not started (Gideon, Oren: !soul get)' : '', c.levelOn ? '' : 'its party does not level crystals (Crystals tab switch)'].filter(Boolean);
    return `<div class="sp-head"><b>${h(c.name)}</b> L${h(c.level)} · ${now} ${tg}</div>${warn.length ? `<div class="sp-warn">${warn.map(h).join(' · ')}</div>` : ''}${planHtml(c.plan)}`;
  }
  function render() {
    const box = document.getElementById(ID); if (!box) return;
    const body = box.querySelector('.sp-body'); if (!body) return;
    const d = S.d;
    if (!d) { body.innerHTML = `<div class="muted">${S.err ? h(S.err) : 'Loading…'}</div>`; return; }
    if (d.error) { body.innerHTML = `<div class="bad">${h(d.error)}</div>`; return; }
    const chars = d.chars || [];
    if (!S.sel || (S.sel !== '_custom' && !chars.some(c => c.name === S.sel))) S.sel = chars.length ? chars[0].name : '_custom';
    const opts = chars.map(c => `<option value="${h(c.name)}"${S.sel === c.name ? ' selected' : ''}>${h(c.name)} (L${h(c.level)}${c.crystal ? ', ' + h(c.crystal.color) + ' ' + h(c.crystal.stage) : ''})</option>`).join('') + `<option value="_custom"${S.sel === '_custom' ? ' selected' : ''}>Custom crystal…</option>`;
    const cu = S.custom || { color: 'red', from: 0, to: 10, level: 40, healer: false };
    const form = S.sel === '_custom' ? `<div class="sp-form">
        <label>Colour <select data-sp="color">${['red', 'green', 'blue'].map(c => `<option${cu.color === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>From stage <input data-sp="from" type="number" inputmode="numeric" min="0" max="17" value="${h(cu.from)}"></label>
        <label>To stage <input data-sp="to" type="number" inputmode="numeric" min="1" max="18" value="${h(cu.to)}"></label>
        <label>Char level <input data-sp="level" type="number" inputmode="numeric" min="1" max="85" value="${h(cu.level)}"></label>
        <label class="chk"><input data-sp="healer" type="checkbox"${cu.healer ? ' checked' : ''}> healer</label>
        <button data-sp="go">Show plan</button></div>${S.cplan ? planHtml(S.cplan) : ''}` : charHtml(chars.find(c => c.name === S.sel));
    body.innerHTML = `<div class="sp-top"><label>Character <select data-sp="sel">${opts}</select></label><span class="muted">${h(chars.length)} with a crystal or a target</span></div>${form}
      <div class="sp-note muted">Data: L2J High Five levelUpCrystalData.xml (chances, stages, absorb type) + forum topic 503 (raid boss colours; its images are partly lost). L2Toggle Kain rates were not verified live — watch Logs/soul.log.</div>`;
  }
  async function load(force) {
    if (S.busy || (!force && Date.now() - S.at < 30000 && S.d)) return;
    S.busy = true;
    try { S.d = await get(''); S.err = ''; } catch (e) { S.err = 'No stage plan (the dashboard server may need a restart): ' + e.message; }
    S.at = Date.now(); S.busy = false; render();
  }
  function ensure() {
    const tab = document.getElementById('tab-crystals'); if (!tab || tab.hidden) return false;
    if (!document.getElementById(ID)) {
      const det = document.createElement('details'); det.id = ID; det.className = 'box sp'; det.style.marginTop = '10px';
      det.innerHTML = '<summary><b>Stage plan</b> <span class="muted">(where each crystal levels next, stage by stage)</span></summary><div class="sp-body"></div>';
      tab.appendChild(det);
      det.addEventListener('toggle', () => { if (det.open) load(false); });
      det.addEventListener('change', (e) => {
        const t = e.target, k = t && t.dataset && t.dataset.sp; if (!k) return;
        if (k === 'sel') { S.sel = t.value; render(); return; }
        S.custom = S.custom || { color: 'red', from: 0, to: 10, level: 40, healer: false };
        S.custom[k] = k === 'healer' ? !!t.checked : k === 'color' ? t.value : Number(t.value);
      });
      det.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-sp="go"]'); if (!b) return;
        const c = S.custom || { color: 'red', from: 0, to: 10, level: 40, healer: false }; S.custom = c;
        b.disabled = true;
        try { const r = await get(`color=${encodeURIComponent(c.color)}&from=${c.from | 0}&to=${c.to | 0}&level=${c.level | 0}&healer=${c.healer ? 1 : 0}`); S.cplan = r.plan || null; if (r.error) S.err = r.error; } catch (er) { S.cplan = null; }
        b.disabled = false; render();
      });
    }
    return true;
  }
  setInterval(() => { if (!document.hidden && ensure()) { const det = document.getElementById(ID); if (det && det.open) load(false); } }, 3000);
  window.SoulPlan = { load, render, _s: S };
})();
