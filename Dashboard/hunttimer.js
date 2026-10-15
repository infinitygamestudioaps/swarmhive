// HUNT TIMER — dashboard part (owner 2026-10-15: "I asked Tank1's team to go to the catacomb but I did not get asked how many hours etc.").
// window.HuntTimer, used by index.html:
//   ask(party, label, opt)       the spot picker's popup (shared dialog uiForm): How long? · When the time is up? · the expected supplies for
//                                that time (Dashboard/huntlogic.js estimate) with "X runs out after about 1 h 20 min" warnings (warn, never refuse)
//                                -> Promise<null (cancelled) | { hours: number | null, endAction, supplyFirst }>
//   afterSave(party, choice, label, mode)   writes / clears the party's timer (/api/hunttimer -> Scripts/data/hunt_timers.json) and sends
//                                           !supply when "Supply run first" was pressed
//   chipHtml(leader)             the party card line "⏱ Hunting at X — 1 h 12 min left" + Extend / End now (clicks handled here)
// The bots: Scripts_dev/swarm.js HUNTTIMER (the clock starts on arrival, early town trips held back, the end action). Guide: docs/guide/pages/hunt-timer.md
(function () {
  'use strict';
  const HL = window.HuntLogic;
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const callApi = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, o).then(r => r.json()));
  const chars = () => (typeof STATE !== 'undefined' && STATE && STATE.chars) || [];
  const partyChars = (p) => chars().filter(c => c.party === p);
  const n0 = (x) => Math.round(Number(x) || 0).toLocaleString('en-US');
  const D = { data: null, at: 0, loading: false };
  function load(force) {
    if (D.loading || (!force && Date.now() - D.at < 20000)) return Promise.resolve(D.data);
    D.loading = true;
    return callApi('/api/hunttimer').then(d => { if (d && !d.error) { D.data = d; D.at = Date.now(); if (typeof TAB !== 'undefined' && TAB === 'parties' && typeof renderParties === 'function' && !(window.UIDialog && UIDialog.isOpen())) renderParties(); } return D.data; })
      .catch(() => D.data).finally(() => { D.loading = false; D.at = D.at || Date.now(); });
  }

  // ---------- the popup ----------
  function supplyBlocks(party, hoursVal) {
    const H = hoursVal === 'stop' ? null : Number(hoursVal);
    const est = HL.estimate(partyChars(party), H, {});
    const out = [];
    out.push(uiH(H === null ? 'Supplies — about how much they use' : `Supplies for ${HL.fmtHours(H)} (about)`));
    if (!est.groups.length) { out.push(uiNote('No supply numbers from this party yet (its characters are offline or run an older script).')); return out; }
    const shortKeys = new Set(est.short.map(s => s.key));
    if (H === null && est.short.length) out.push(uiNote('Running out within the next 2 hours:'));
    const sh = est.short.slice(0, 6);
    sh.forEach(s => out.push(uiWarn(s.text)));
    if (est.short.length > sh.length) out.push(uiNote(`+ ${est.short.length - sh.length} more running out — see the party card's supply chips.`));
    out.push(uiKV(est.groups.map(g => {
      const n = g.chars.length, who = `${n} character${n === 1 ? '' : 's'}`;
      const txt = H === null ? `~${n0(g.perHour)} an hour (${who}) · they carry ${n0(g.have)}`
        : `~${n0(g.need)} needed (${who}) · they carry ${n0(g.have)}${shortKeys.has(g.key) ? '' : ' ✓'}`;
      return [g.label, txt];
    })));
    if (H !== null && !est.short.length) out.push(uiNote('Everyone carries enough for this time ✓'));
    if (est.short.length) out.push(uiNote('"Supply run first" sends the party to Giran for a supply run before it goes there (the run is your !supply order).'));
    const m = [];
    if (est.seen.length) m.push(`Measured from their own hunting (last 6 h): ${est.seen.join(', ')}.`);
    if (est.about.length) m.push(`Rule of thumb for ${est.about.join(', ')} (not 20 min of measured hunting yet): fighters ~1,200 soulshots an hour, casters ~600 / healers ~300 spiritshots, mana potions 20 / 60 / 80, healing potions 3, Spirit Ore 15-60, Holy Water / Soul Ore 10 — only for characters whose skills use them.`);
    if (m.length) out.push(uiNote(m.join(' ')));
    return out;
  }
  function rulesBlocks(v) {
    if (v.hours === 'stop') return [uiNote('No timer: the party hunts here until you stop it or choose something else. The normal automatic trips (supply runs, Giran regroups, daily Kamaloka …) stay as they are.')];
    const act = HL.ACTIONS.find(a => a.value === v.end) || HL.ACTIONS[0];
    return [uiH(`While the ${HL.fmtHours(v.hours)} run`), uiList([
      'The party stays at this spot: no supply run (unless shots really run out — then it says so), no Giran trips, no daily Kamaloka, no warehouse / letters / Seven Signs trips, it does not "move on when outgrown".',
      'The clock starts when they arrive (at the latest 45 min from now).',
      'Deaths, a wipe, escapes and your own orders always work.',
      ['When the time is up: ', uiEm(act.label), ' — ', act.hint, '.'],
    ])];
  }
  async function ask(party, label, opt) {
    const o = opt || {};
    if (!HL || typeof uiForm !== 'function') return { hours: null, endAction: 'town', supplyFirst: false };   // an old page: today's behaviour
    load(false);
    const n = partyChars(party).length;
    const cur = D.data && D.data.data && D.data.data.parties ? HL.entry(D.data.data, party) : null;
    const body = [uiP(`Party ${party}${n ? ` (${n} character${n === 1 ? '' : 's'})` : ''} → `, uiEm(label), o.stay ? ' (stay even if occupied)' : '')];
    (o.parts || []).forEach(p => body.push(uiNote(p)));
    if (cur) body.push(uiNote(`Its hunting timer now: ${HL.fmtHours(cur.hours)} at ${cur.spot || 'its spot'} — this choice replaces it.`));
    const r = await uiForm({
      title: `Hunt here — how long?`,
      body,
      fields: [
        { id: 'hours', label: 'How long?', options: HL.HOURS.map(h => ({ label: h.label, value: h.value })), value: 'stop' },
        { id: 'end', label: 'When the time is up', options: HL.ACTIONS.map(a => ({ label: a.label, value: a.value, hint: a.hint })), value: 'town', note: 'Only used with a time.' },
      ],
      render: (v) => [...supplyBlocks(party, v.hours), ...rulesBlocks(v)],
      buttons: [{ label: 'Supply run first', value: 'supply' }, { label: 'Go there', value: 'go', primary: true }],
    });
    if (!r) return null;
    return { hours: r.values.hours === 'stop' ? null : Number(r.values.hours), endAction: r.values.end || 'town', supplyFirst: r.value === 'supply' };
  }
  async function post(b) {
    const r = await callApi('/api/hunttimer', { method: 'POST', body: JSON.stringify(b) });
    if (!r || r.error) throw new Error((r && r.error) || 'save failed');
    if (D.data) { D.data.data = r.data; D.at = Date.now(); }
    load(true);
    return r;
  }
  const hasTimer = (party) => !!(D.data && D.data.data && D.data.data.parties && D.data.data.parties[party]);
  /** after the spot choice was saved: the timer (set / clear) + the supply run first */
  async function afterSave(party, choice, label, mode) {
    try {
      if (!D.data) await load(true);
      if (mode !== 'manual' || !choice || choice.hours === null) { if (hasTimer(party)) await post({ party, act: 'clear' }); }
      else await post({ party, act: 'set', hours: choice.hours, endAction: choice.endAction, spot: label });
    } catch (e) { if (typeof uiError === 'function') uiError(`The hunting spot is saved, but the timer is not: ${e.message}`, 'Hunting timer not saved'); }
    if (choice && choice.supplyFirst) {
      try {
        const d = await callApi('/api/command', { method: 'POST', body: JSON.stringify({ target: 'party:' + party, cmd: '!supply' }) });
        const m = document.getElementById('msg'); if (m) m.textContent = d && d.ok ? `party ${party}: supply run first (!supply sent), then the hunting spot` : `party ${party}: supply run not sent — ${(d && d.error) || 'no answer'}`;
      } catch (e) { if (typeof uiError === 'function') uiError(e.message, 'Supply run not sent'); }
    }
  }

  // ---------- the party card ----------
  function chipHtml(leader) {
    if (!HL) return '';
    load(false);
    if (!D.data || !D.data.data) return '';
    const st = (D.data.status || {})[leader] || null;
    const L = HL.cardLine(D.data.data, st, leader, Date.now()); if (!L) return '';
    const lead = chars().find(c => c.name === leader), ht = lead && lead.huntTimer;
    const held = ht && ht.id === L.c.id && Array.isArray(ht.held) ? ht.held : [];
    const tip = [L.c.startWhy ? `Clock: ${L.c.startWhy}${L.c.startAt ? ' (' + new Date(L.c.startAt).toTimeString().slice(0, 5) + ')' : ''}` : 'The clock starts when the party arrives (at the latest 45 min after the choice).',
      L.c.endAt ? `Ends ${new Date(L.c.endAt).toTimeString().slice(0, 5)}, then: ${HL.ACTION_TEXT[L.c.endAction]}.` : `Then: ${HL.ACTION_TEXT[L.c.endAction]}.`,
      held.length ? 'Held back lately: ' + held.map(h => `${h.why.replace(/^hunting timer: /, '')} (${String(h.at).slice(11, 16)})`).join('; ') : ''].filter(Boolean).join('\n');
    const btns = L.state === 'done' ? `<button class="htbtn" data-htclear="${E(leader)}" title="Remove the finished timer from the card">OK</button>`
      : `<button class="htbtn" data-htext="${E(leader)}">Extend</button><button class="htbtn" data-htend="${E(leader)}">End now</button>`;
    return ` <span class="htline"><span class="chip ${L.cls} htchip" title="${E(tip)}">⏱ ${E(L.text)}${L.then && L.state === 'running' ? ' · then ' + E(L.then) : ''}${held.length ? ` · held: ${held.length}` : ''}</span>${btns}</span>`;
  }
  async function extend(party) {
    const v = await uiChoice({ title: `More hunting time — party ${party}`, body: 'How much longer should the party hunt at its spot?',
      buttons: [{ label: '+30 min', value: 30 }, { label: '+1 h', value: 60 }, { label: '+2 h', value: 120, primary: true }] });
    if (!v) return;
    try { await post({ party, act: 'extend', addMin: v }); if (typeof renderParties === 'function') renderParties(); } catch (e) { uiError(e.message, 'Not extended'); }
  }
  async function endNow(party) {
    const e = D.data && D.data.data ? HL.entry(D.data.data, party) : null; if (!e) return;
    const act = HL.ACTIONS.find(a => a.value === e.endAction) || HL.ACTIONS[0];
    if (!await uiConfirm({ title: `End the hunting time now — party ${party}?`, body: [uiP('The leader does the end action within 15 seconds: ', uiEm(act.label), '.'), uiNote(act.hint + '.')], confirmText: 'End now' })) return;
    try { await post({ party, act: 'end' }); if (typeof renderParties === 'function') renderParties(); } catch (er) { uiError(er.message, 'Not ended'); }
  }
  document.addEventListener('click', (ev) => {
    const t = ev.target && ev.target.closest && ev.target.closest('[data-htext],[data-htend],[data-htclear]'); if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    if (t.dataset.htext) extend(t.dataset.htext);
    else if (t.dataset.htend) endNow(t.dataset.htend);
    else if (t.dataset.htclear) post({ party: t.dataset.htclear, act: 'clear' }).then(() => { if (typeof renderParties === 'function') renderParties(); }).catch(er => uiError(er.message, 'Not removed'));
  }, true);
  window.HuntTimer = { load, ask, afterSave, chipHtml, extend, endNow, data: () => D.data };
})();
