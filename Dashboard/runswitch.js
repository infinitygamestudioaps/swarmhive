// RUN SWITCH (owner 2026-10-13 17:50: "You don't need to start the bots automatically ... just stop them and switch them on as you like").
// One big Start / Stop toggle per party card (fixed place, fixed width: no layout jump), a fixed-height state line under the party head, a
// toggle on the character page (members: stop / back with the party), and "Start all / Stop all" in the header. Every change asks first in
// the shared dialog (uidialog.js: uiConfirm, never alert / confirm / prompt). Data: STATE.run (/api/state) or /api/runstate; writes:
// POST /api/runstate (Dashboard/runstate_api.js) which also sends !start / !stop to the party. Default: every party OFF.
(function () {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let OWN = null, OWNAT = 0, BUSY = false;
  const call = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o || {})).then(r => r.json()));
  function data() {
    try { if (typeof STATE !== 'undefined' && STATE && STATE.run) return STATE.run; } catch (e) { }
    if (!OWN || Date.now() - OWNAT > 5000) { OWNAT = Date.now(); call('/api/runstate').then(r => { if (r && r.parties) OWN = r; }).catch(() => { }); }
    return OWN;
  }
  const party = (leader) => { const d = data(); return d ? (d.parties || []).find(p => p.leader === leader) || null : null; };
  const partyOfChar = (name) => { const d = data(); return d ? (d.parties || []).find(p => (p.members || []).includes(name)) || null : null; };
  const niceTask = (t) => String(t || '').replace(/\s*->\s*$/, '').replace(/:\s*$/, '').trim();

  /** the big toggle for a party card (put it first in the card's button row) */
  function partyButton(leader) {
    const p = party(leader), on = !!(p && p.on);
    return `<button class="runsw ${on ? 'on' : 'off'}" data-runsw="party" data-name="${E(leader)}" data-on="${on ? 0 : 1}" title="${on ? 'Running — Stop: the party stops and does nothing on its own until Start' : 'Stopped — Start: switch the party on and start ' + E(p && p.plan ? p.plan.text : 'its activity')}">${on ? '■ Stop' : '▶ Start'}</button>`;
  }
  /** the fixed-height state line under the party head */
  function partyLine(leader) {
    const p = party(leader);
    if (!p) return '<div class="runline off">○ Stopped — does nothing until you press Start</div>';
    const task = niceTask(p.task);
    let txt = p.on ? `● Running${task ? ': ' + E(task) : ''}` : '○ Stopped — does nothing until you press Start';
    let warn = '';
    if (p.seen === null && p.online) warn = ' · the bots run an older swarm.js: the switch works after the deploy';
    else if (p.seen !== null && p.seen !== p.on) warn = ' · the bots have not picked it up yet';
    const held = (p.held || []).length ? ` · stopped on their own: ${p.held.map(E).join(', ')}` : '';
    return `<div class="runline ${p.on ? 'on' : 'off'}" title="${E((p.on ? 'Running' : 'Stopped') + (p.at ? ' since ' + new Date(p.at).toLocaleString() : '') + (p.by ? ' by ' + p.by : '') + (p.why ? ' (' + p.why + ')' : '') + (p.on ? '' : ' — Start does: ' + (p.plan ? p.plan.text : 'its activity')))}">${txt}${E(warn)}${held}</div>`;
  }
  /** the character page: a leader's toggle is its party's; a member can be stopped on its own */
  /** HANDSOFF-2026-10-26: the per-character "hands off" switch (Hive leaves it alone; only your own orders to it run). Shown once the
   *  dashboard server sends handsOff (after its restart); default OFF. */
  function handsOffBlock(name) {
    const d = data(); if (!d || !d.handsOff || typeof d.handsOff !== 'object') return '';
    const on = !!d.handsOff[name];
    return `<span class="runc"><button class="runsw ${on ? 'on' : 'off'}" data-runsw="handsoff" data-name="${E(name)}" data-on="${on ? 0 : 1}" title="${on ? 'Hands off is ON — Hive does nothing with ' + E(name) + '. Click: Hive runs it again' : 'Hands off: Hive leaves ' + E(name) + ' completely alone (only your own orders to it run)'}">✋ Hands off: ${on ? 'ON' : 'OFF'}</button><span class="runct runho">${on ? 'Hive leaves it alone (no party orders, not waited for); your own orders still run' : 'Hive runs it · ON = Hive leaves it to you'}</span></span>`;
  }
  function charBlock(name) {
    const p = partyOfChar(name);
    if (!p) return handsOffBlock(name);
    if (p.leader === name) return `<span class="runc">${partyButton(name)}<span class="runct">${p.on ? 'party running' : 'party stopped'}${(p.members || []).length > 1 ? ' (leads ' + (p.members.length) + ')' : ''}</span></span>${handsOffBlock(name)}`;
    const d = data(), own = d && d.chars ? d.chars[name] : null, held = !!(own && own.on === false);
    const btn = held
      ? `<button class="runsw off" data-runsw="char" data-name="${E(name)}" data-on="1" title="Back with party ${E(p.leader)}: follows + assists again">▶ Start</button>`
      : `<button class="runsw on" data-runsw="char" data-name="${E(name)}" data-on="0" title="Stop only ${E(name)}: it stands still, the party goes on without it">■ Stop</button>`;
    return `<span class="runc">${btn}<span class="runct">${held ? 'stopped on its own' : 'party ' + E(p.leader) + (p.on ? ' running' : ' stopped')}</span></span>${handsOffBlock(name)}`;
  }
  /** header: Start all / Stop all + how many parties run */
  function paintHeader() {
    const el = document.getElementById('runAll'); if (!el) return;
    const d = data(); if (!d) { el.innerHTML = ''; return; }
    const n = (d.parties || []).length, on = (d.parties || []).filter(p => p.on).length;
    const html = `<button class="runsw off sm" data-runsw="all" data-on="1" title="Switch every party on and start its activity">▶ Start all</button><button class="runsw on sm" data-runsw="all" data-on="0" title="Stop every party: nothing happens on its own until Start">■ Stop all</button><span class="runct">${on}/${n} ${n === 1 ? 'party' : 'parties'} running</span>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  async function ask(kind, name, on) {
    const d = data() || { parties: [] };
    if (kind === 'party') {
      const p = party(name) || { members: [name], plan: null };
      return uiConfirm(on ? {
        title: `Start party ${name}?`,
        body: [uiP('Switches the party ', uiEm('ON'), ' and starts:'), uiP(uiEm(p.plan ? p.plan.text : 'its configured activity')),
          uiNote('While it is on it works by itself again: leveling, supply runs, regroups, daily Kamaloka … (as you set them up). Stop switches it off again.')],
        confirmText: '▶ Start', cancelText: 'Cancel' } : {
        title: `Stop party ${name}?`,
        body: [uiP(`Everyone of party ${name} (${(p.members || []).length}) stops now and does `, uiEm('nothing on its own'), ' until you press Start: no leveling, no supply runs, no regroups, no resume after a restart.'),
          uiList(['They still heal, use potions, defend themselves, res each other and respawn in town.', 'They still answer trades and obey every order you send (the order runs, then they wait again).', 'A raid boss fight that is already on is finished first (raid rule).'])],
        confirmText: '■ Stop', cancelText: 'Cancel' });
    }
    if (kind === 'all') {
      const ps = d.parties || [];
      return uiConfirm(on ? {
        title: `Start all ${ps.length} parties?`,
        body: [uiP('Every party is switched ', uiEm('ON'), ' and starts:'), uiList(ps.map(p => `${p.leader}: ${p.plan ? p.plan.text : 'its activity'}`)), uiNote('Characters stopped on their own are switched back to their party.')],
        confirmText: '▶ Start all', cancelText: 'Cancel' } : {
        title: `Stop all ${ps.length} parties?`,
        body: [uiP('Every party stops now and does ', uiEm('nothing on its own'), ' until you press Start. Survival, trades and your orders still work.'), uiList(ps.map(p => p.leader))],
        confirmText: '■ Stop all', cancelText: 'Cancel' });
    }
    if (kind === 'handsoff') {                                   // HANDSOFF-2026-10-26
      return uiConfirm(on ? {
        title: `Hands off ${name}?`,
        body: [uiP(`Hive leaves ${name} completely alone: no hunting, leveling, follow, regroups, supplies, selling, trades, hand-overs, storing, Hive skills, heals or potions of its own, and no orders from its party leader.`),
          uiList([`Its party does not wait for it and does not count it.`, `Your own orders sent to ${name} (its character page / commands) still run.`, `Its L2Swarm profile (and you, in the game) decide what it does. Hive gives back the skill / heal lists it had switched off.`])],
        confirmText: '✋ Hands off', cancelText: 'Cancel' } : {
        title: `Hive runs ${name} again?`, body: [uiP(`Hands off ends: ${name} is back with its party; the party's Start / Stop decides what it does.`)], confirmText: 'Hive runs it again', cancelText: 'Cancel' });
    }
    const p = partyOfChar(name);
    return uiConfirm(on ? {
      title: `Start ${name} again?`, body: [uiP(`${name} follows and assists party ${p ? p.leader : ''} again; the party's switch (${p && p.on ? 'running' : 'stopped'}) decides what it does.`)], confirmText: '▶ Start', cancelText: 'Cancel' } : {
      title: `Stop only ${name}?`,
      body: [uiP(`${name} stands still where it is: no follow, no assist, no team walks, no trips of its own. Party ${p ? p.leader : ''} goes on without it (the leader does not wait for it).`),
        uiNote('It still heals and defends itself, answers trades and obeys orders you send to it. Start brings it back.')],
      confirmText: '■ Stop', cancelText: 'Cancel' });
  }
  async function toggle(kind, name, on) {
    if (BUSY) return; BUSY = true;
    try {
      if (!(await ask(kind, name, on))) return;
      const body = kind === 'all' ? { all: true, on } : kind === 'party' ? { party: name, on } : kind === 'handsoff' ? { char: name, handsOff: !!on } : { char: name, on: on ? null : false };   // HANDSOFF-2026-10-26
      const r = await call('/api/runstate', { method: 'POST', body: JSON.stringify(body) });
      if (!r || r.error) { uiError((r && r.error) || 'no answer from the dashboard server', 'Not switched'); return; }
      if (r.state) { OWN = r.state; OWNAT = Date.now(); try { if (typeof STATE !== 'undefined' && STATE) STATE.run = r.state; } catch (e) { } }
      const failed = (r.sent || []).filter(s => !s.ok);
      if (failed.length) uiAlert({ title: 'Switched — but an order did not go out', kind: 'error', body: [uiP('The switch is saved (the bots read it within a few seconds). These orders could not be sent:'), uiList(failed.map(s => `${s.target} ${s.cmd}: ${s.error || '?'}`))] });
      paintHeader();
      try { if (typeof renderParties === 'function' && typeof TAB !== 'undefined' && TAB === 'parties') renderParties(); } catch (e) { }
      try { document.dispatchEvent(new CustomEvent('runswitch', { detail: r.state })); } catch (e) { }
    } finally { BUSY = false; }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-runsw]'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    toggle(b.dataset.runsw, b.dataset.name || '', b.dataset.on === '1');
  }, true);
  window.RunSwitch = { partyButton, partyLine, charBlock, paintHeader, data };
})();
