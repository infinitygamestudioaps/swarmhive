// 7 SIGNS page #/sevensigns (user 2026-10-12: "Priest of Dawn should not be a given; it must be something you sign up for. Make a tab called
// '7 Signs' where you can enroll groups or single accounts so they sign up automatically. And at the same time respect other commands").
// Edits Scripts/data/seven_signs.json (swarm.js SSOPTIN, re-read every 30 s): which parties / characters go to the Priest of Dawn by themselves
// (sign-up with the Lords of Dawn, period check, seal stones) + the seal-stone switch. Shows the period / cycle / winner, each character's
// registration (Dawn / Dusk / none, checked when), seal stones in the bag, and "Sign up now" buttons (!dawn / !dawn <name> through /api/command,
// a user order: it runs whether enrolled or not). Data: Dashboard/sevensigns_api.js (GET/POST /api/sevensigns).
// Uses index.html globals: esc, api, stopChar, TAB, and uidialog's uiConfirm / uiP / uiEm / uiWarn / uiNote. No browser alert / confirm / prompt.
(function () {
  'use strict';
  const SEC = 'tab-sevensigns';
  const S7 = { open: false, d: null, rev: '', busy: false, timer: 0, msgT: 0, closedParties: new Set() };
  const $id = (i) => document.getElementById(i);
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const lc = (s) => String(s || '').toLowerCase();
  const ago = (ms) => { if (!ms) return ''; const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 90 ? s + ' s ago' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const when = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const P = (t) => (typeof uiP === 'function' ? uiP(t) : t);

  // ============================================================================================ data
  async function load() {
    let d = null;
    try { d = await api('/api/sevensigns'); } catch (e) { flash('The dashboard server has no 7 Signs API yet (it needs a restart).', true); render(); return; }
    if (!d || d.error) { flash((d && d.error) || 'no answer', true); render(); return; }
    if (d.broken) flash(`seven_signs.json does not parse (${d.broken}) — saving is blocked until it is fixed or restored from Scripts/data/history/.`, true);
    S7.d = d; S7.rev = d.rev; render();
  }
  async function save(cfg, what) {
    if (S7.busy) return false;
    S7.busy = true; render();
    let r = null;
    try { r = await api('/api/sevensigns', { method: 'POST', body: JSON.stringify({ cfg, rev: S7.rev }) }); } catch (e) { r = { error: e.message }; }
    S7.busy = false;
    if (r && r.ok) { S7.rev = r.rev; flash(`${what} — saved; the bots read it within 30 seconds.`); await load(); return true; }
    flash(r && r.conflict ? 'Someone else changed the Seven Signs settings meanwhile — the page shows theirs now, try again.' : `Not saved: ${(r && r.error) || 'no answer'}`, true);
    await load(); return false;
  }
  const cfgNow = () => { const c = (S7.d && S7.d.cfg) || {}; return { parties: (c.parties || []).slice(), chars: (c.chars || []).slice(), contributeStones: c.contributeStones !== false }; };
  const without = (L, n) => L.filter(x => lc(x) !== lc(n));

  // ============================================================================================ page frame
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win s7'; s.hidden = true;
    s.innerHTML = `<div class="s7-head"><h2><img class="gi" src="/icons/icon/accessory_lbracelet_of_dawn.png" alt=""> 7 Signs</h2>
        <span class="muted s7-intro">Who signs up with the Lords of Dawn by itself. Nobody goes to the Priest of Dawn unless its party or the character is enrolled here; "Sign up now" is your order and works for anyone.</span></div>
      <div class="s7-msg" id="s7Msg" role="status" hidden></div>
      <div class="box" id="s7Period"></div>
      <div class="box" id="s7Set"></div>
      <div id="s7Parties"></div>
      <details class="box s7-log"><summary><b>Priest of Dawn log</b> <span class="muted">(Logs/dawn.log, newest first)</span></summary><div id="s7Log"></div></details>
      <details class="box s7-help"><summary><b>How it works</b></summary><div class="s7-helpbody">
        <p><b>Enrolled</b> (the whole party, or one character): while it stands in a town with a Priest of Dawn and nothing else runs, it reads the period, signs up with the <b>Lords of Dawn</b> once per competition period (never Dusk) and, if the switch is on, hands in its seal stones. A party leader also takes his team to Giran for it every few hours when someone enrolled still needs it.</p>
        <p><b>Your orders and quests come first:</b> nothing of this starts while a quest, one of your orders (park, supply, town, …) or a raid / mission / instance runs; a teammate in a quest is skipped.</p>
        <p><b>Sign up now</b> sends <code>!dawn</code> (the party leader takes the party) or <code>!dawn &lt;name&gt;</code> (only that character). It works whether enrolled or not, but never in a raid / mission / instance or the seal validation period, and a character in a quest is skipped.</p>
        <p><b>Catacombs / necropolises</b> (Gatekeeper Ziggurat) still need every member registered; a party that is not enrolled and not signed up is shown "closed (Seven Signs)" there until you enroll it here or press Sign up now.</p>
        <p>Sign-up is only possible in the competition period (Monday 18:00 for one week) and after the 1st class transfer. Saved to Scripts/data/seven_signs.json (old versions in Scripts/data/history/).</p>
      </div></details>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('change', onChange);
    s.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.s7party) { if (d.open) S7.closedParties.delete(d.dataset.s7party); else S7.closedParties.add(d.dataset.s7party); } }, true);
    return s;
  }
  function route(kind) {
    if (kind === 'sevensigns') { open(); return true; }
    close(); return false;
  }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'sevensigns'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'sevensigns')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const was = S7.open; s.hidden = false; S7.open = true;
    if (!was) window.scrollTo(0, 0);
    if (!S7.timer) S7.timer = setInterval(() => { if (S7.open && !document.hidden && !S7.busy) load(); }, 30000);
    render(); load();
  }
  function close() {
    if (!S7.open) return;
    S7.open = false; clearInterval(S7.timer); S7.timer = 0;
    const s = $id(SEC); if (s) s.hidden = true;
  }
  function flash(t, bad) {
    const m = $id('s7Msg'); if (!m) return;
    m.hidden = !t; m.className = 's7-msg' + (bad ? ' bad' : ''); m.textContent = t || '';
    clearTimeout(S7.msgT); S7.msgT = setTimeout(() => { const x = $id('s7Msg'); if (x) x.hidden = true; }, bad ? 15000 : 8000);
  }

  // ============================================================================================ render
  const sw = (attrs, on, label, title, disabled) => `<label class="s7-sw${disabled ? ' dis' : ''}" title="${h(title || '')}"><input type="checkbox" ${attrs} ${on ? 'checked' : ''} ${disabled || S7.busy ? 'disabled' : ''}><span class="tr" aria-hidden="true"></span><span class="lb">${h(label)}</span></label>`;
  function chip(m) {
    const t = m.at ? ago(m.at) : 'never checked';
    if (m.registered === 'dawn') return `<span class="chip ssdawn" title="signed up with the Lords of Dawn this cycle (checked ${h(t)})">☀ Dawn</span>`;
    if (m.registered === 'dusk') return `<span class="chip ssdusk" title="registered with the Revolutionaries of Dusk this cycle (checked ${h(t)})">☾ Dusk</span>`;
    return `<span class="chip ssnone" title="not signed up this cycle (checked ${h(t)})">7S –</span>`;
  }
  const STATUS = { signed: 'signed up', member: 'member (the priest says so)', failed: 'last try failed', notown: 'no Priest of Dawn in that town', firstclass: 'needs the 1st class transfer', fee: 'the priest asked for a fee — not paid', dusk: 'Dusk', none: 'not a member' };
  function statusText(m) {
    const bits = [];
    if (m.status === 'failed' && m.tries >= 3) bits.push(`gave up after ${m.tries} failed tries this cycle — only Sign up now tries again`);
    else if (m.status) bits.push((STATUS[m.status] || m.status) + (m.status === 'failed' ? ` (${m.tries}/3)` : ''));
    else if (!m.registered) bits.push('no try this cycle');
    bits.push(m.at ? 'checked ' + ago(m.at) : 'never checked');
    if (m.skipped && m.skipAt && Date.now() - m.skipAt < 864e5) bits.push('skipped ' + ago(m.skipAt) + ': ' + m.skipped);
    return bits.join(' · ');
  }
  function stonesHtml(m) {
    if (!m.stones) return '<span class="muted" title="the bag is reported while the character runs">stones ?</span>';
    if (!m.stones.total) return `<span class="muted">no stones</span>`;
    const one = (k, ic, t) => m.stones[k] ? `<span class="s7-st" title="${t} Seal Stone"><img src="/icons/icon/${ic}.png" alt="">${m.stones[k]}</span>` : '';
    return one('blue', 'etc_water_rune_i00', 'Blue') + one('green', 'etc_wind_rune_i00', 'Green') + one('red', 'etc_fire_rune_i00', 'Red');
  }
  function render() {
    if (!S7.open) return;
    const d = S7.d, per = $id('s7Period'), set = $id('s7Set'), pl = $id('s7Parties'), lg = $id('s7Log');
    if (!d) { if (per) per.innerHTML = '<span class="muted">loading…</span>'; return; }
    const cur = d.cur || {}, st = d.state || {};
    const period = cur.period || 'unknown';
    const all = []; (d.parties || []).forEach(p => p.members.forEach(m => all.push(m)));
    const dawn = all.filter(m => m.registered === 'dawn').length, enr = all.filter(m => m.enrolled).length;
    per.innerHTML = `<div class="s7-kv"><span>Period</span><b class="s7-per ${h(period)}">${h(period)}</b>
        ${cur.cycle ? `<span>Cycle</span><b>${h(cur.cycle)}</b>` : ''}
        ${period === 'validation' ? `<span>Last winner</span><b>${h(cur.winner || 'unknown')}</b>` : ''}
        <span>Next change</span><b>${h(when(cur.nextChange))}</b></div>
      <div class="muted s7-sub">${st.checkedAt ? `Priest of Dawn read ${h(ago(st.checkedAt))}${st.by ? ' by ' + h(st.by) : ''}${cur.stale ? ' (the period is carried over the Monday change)' : ''}` : 'no Priest of Dawn read yet'} · <b>${dawn}</b> of ${all.length} characters signed up with Dawn this cycle · <b>${enr}</b> enrolled</div>
      ${period === 'validation' ? '<div class="s7-warn">Seal validation period: nobody can sign up until the next change. Only characters signed up in the last competition (on the winning side) may use a Ziggurat now.</div>' : ''}
      ${period === 'unknown' ? '<div class="s7-warn">The period is not known yet: an enrolled character reads it at the Priest of Dawn, or press Sign up now.</div>' : ''}`;
    set.innerHTML = `<div class="s7-row">${sw('data-s7="stones"', d.cfg.contributeStones, d.cfg.contributeStones ? 'Hand in seal stones: on' : 'Hand in seal stones: off', 'competition period: enrolled characters that are signed up give all their seal stones to the Priest of Dawn on a town visit (points for Dawn)')}
      <span class="muted s7-sub">${d.exists ? 'Scripts/data/' + h(d.file) : 'no settings file yet: nobody is enrolled'}</span></div>`;
    pl.innerHTML = (d.parties || []).map(partyHtml).join('') || '<div class="box muted">no parties known (swarm.config.json)</div>';
    if (lg) lg.innerHTML = (d.log || []).length ? `<pre class="s7-pre">${h(d.log.slice().reverse().join('\n'))}</pre>` : '<span class="muted">nothing logged yet</span>';
  }
  function partyHtml(p) {
    const dawn = p.members.filter(m => m.registered === 'dawn').length, enr = p.members.filter(m => m.enrolled).length;
    const open = !S7.closedParties.has(p.leader);
    const rows = p.members.map(m => {
      const own = (S7.d.cfg.chars || []).some(x => lc(x) === lc(m.name));
      return `<div class="s7-mem${m.online ? '' : ' off'}">
        <div class="s7-who"><a href="#/char/${encodeURIComponent(m.name)}"><b>${h(m.name)}</b></a> <span class="muted">${m.level != null ? m.level : '?'} ${h(m.cls || '')}${m.online ? '' : ' · offline'}</span></div>
        <div class="s7-reg">${chip(m)} <span class="muted s7-st-txt">${h(statusText(m))}</span></div>
        <div class="s7-dun muted" title="${h(m.why || '')}">${m.allowed === null ? '' : m.allowed ? 'Ziggurat: may enter' : 'Ziggurat: closed'}</div>
        <div class="s7-stones">${stonesHtml(m)}</div>
        <div class="s7-act">${p.enrolled ? `<span class="s7-via" title="enrolled through the party — switch the party off to choose per character">✓ via party</span>` : sw(`data-s7char="${h(m.name)}"`, own, own ? 'Enrolled' : 'Enroll', 'this character signs up by itself')}
          <button class="s7-btn" data-s7sign="char:${h(m.name)}" ${S7.busy ? 'disabled' : ''} title="send !dawn ${h(m.name)}: only ${h(m.name)} goes to the Priest of Dawn now">Sign up</button></div>
      </div>`;
    }).join('');
    return `<details class="box s7-party${p.enrolled ? ' enr' : ''}" data-s7party="${h(p.leader)}" ${open ? 'open' : ''}>
      <summary><b>Party ${h(p.leader)}</b> <span class="muted">${p.members.length} chars</span> <span class="chip ${dawn === p.members.length ? 'ssdawn' : 'ssnone'}" title="signed up with Dawn this cycle">☀ ${dawn}/${p.members.length}</span>${p.enrolled ? ' <span class="s7-tag">enrolled</span>' : enr ? ` <span class="s7-tag part">${enr} enrolled</span>` : ''}</summary>
      <div class="s7-prow">${sw(`data-s7party-enroll="${h(p.leader)}"`, p.enrolled, p.enrolled ? 'Whole party enrolled' : 'Enroll the whole party', 'every character of this party signs up by itself (now and new members later)')}
        <button class="s7-btn gold" data-s7sign="party:${h(p.leader)}" ${S7.busy ? 'disabled' : ''} title="send !dawn: ${h(p.leader)} takes the party to the Priest of Dawn in Giran now">Sign up party now</button></div>
      <div class="s7-mems">${rows}</div></details>`;
  }

  // ============================================================================================ actions
  async function onChange(e) {
    const t = e.target; if (!t || t.type !== 'checkbox' || !S7.d) return;
    const c = cfgNow();
    if (t.dataset.s7 === 'stones') { c.contributeStones = t.checked; await save(c, `seal stones ${t.checked ? 'on' : 'off'}`); return; }
    if (t.dataset.s7partyEnroll) {
      const p = t.dataset.s7partyEnroll;
      c.parties = without(c.parties, p); if (t.checked) c.parties.push(p);
      await save(c, t.checked ? `party ${p} enrolled` : `party ${p} no longer enrolled`); return;
    }
    if (t.dataset.s7char) {
      const n = t.dataset.s7char;
      c.chars = without(c.chars, n); if (t.checked) c.chars.push(n);
      await save(c, t.checked ? `${n} enrolled` : `${n} no longer enrolled`);
    }
  }
  async function onClick(e) {
    const b = e.target.closest('[data-s7sign]'); if (!b || !S7.d) return;
    e.preventDefault();
    const tg = b.dataset.s7sign, i = tg.indexOf(':'), kind = tg.slice(0, i), name = tg.slice(i + 1);
    const per = (S7.d.cur || {}).period;
    const body = kind === 'party'
      ? [P(`${name} takes the whole party to the Priest of Dawn in Giran and everyone who is not signed up yet signs up with the Lords of Dawn (never Dusk).`),
        P('This is your order: it runs even when the party is not enrolled. Not during a raid, mission or instance; a character in a quest is skipped. Leveling resumes afterwards.')]
      : [P(`Only ${name} goes to the Priest of Dawn (.giran first when it is not in a town with one) and signs up with the Lords of Dawn.`),
        P('This is your order: it runs even when the character is not enrolled. Not during a raid, mission, instance or its own quest. A party leader takes his party along to Giran, but only he signs up.')];
    if (per === 'validation' && typeof uiWarn === 'function') body.push(uiWarn('It is the seal validation period: nobody can sign up now — the bot will only say so.'));
    const ok = await uiConfirm({ title: kind === 'party' ? `Sign up party ${name} now?` : `Sign up ${name} now?`, body, confirmText: 'Sign up now', cancelText: 'Cancel' });
    if (!ok) return;
    const cmd = kind === 'party' ? '!dawn' : `!dawn ${name}`;
    let r = null;
    try { r = await api('/api/command', { method: 'POST', body: JSON.stringify({ target: tg, cmd }) }); } catch (er) { r = { error: er.message }; }
    if (r && r.ok) flash(`${cmd} sent to ${kind === 'party' ? 'party ' + name : name}${r.sent === 0 ? ' — but no window took it (offline?)' : ''}. The result shows up in the log below within a few minutes.`, r.sent === 0);
    else flash(`Not sent: ${(r && r.error) || 'no answer'}`, true);
  }

  window.SevenSignsPage = { route, open, close, reload: load };
})();
