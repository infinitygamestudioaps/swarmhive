// RUNNERBTN-2026-11-02 (owner: "I dont see the Call collector under #/char/Spoiler3?? On mobile og pc"): a VISIBLE "🐎 Call the runner" button on
// every party card and on the character page (its party). It sends the existing order '!callrunner <leader>' (commands.js catalog 'callrunner',
// swarm.js RUNNERCALL) after the usual confirmOrder, and shows the runner's state next to it (GET /api/crafterpage?view=runner, every 15 s).
// Greyed out with the reason when no runner is set, the runner is switched off, or the party is the runner's own / the crafter's.
// Exposes window.RunnerCall = { button(leader, small), refresh(), decide(info, leader), stateText(info, leader) }.
(function () {
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** pure: can this party call the runner? -> { ok, why } */
  function decide(info, leader) {
    const I = info || {};
    if (!I.runner) return { ok: false, why: 'no runner set (Crafter page → Runner)' };
    if (!I.on) return { ok: false, why: `the runner ${I.runner} is switched off (Crafter page → Runner)` };
    if (leader && (leader === I.runnerParty || leader === I.runner)) return { ok: false, why: `this is the runner's own party` };
    if (leader && I.crafter && (leader === I.crafterParty || leader === I.crafter)) return { ok: false, why: `this is the crafter's party (it stays in town)` };
    return { ok: true, why: '' };
  }
  /** pure: one short line about the runner, from this party's view */
  function stateText(info, leader) {
    const I = info || {}; if (!I.runner) return ''; if (!I.on) return 'runner off';
    const q = Array.isArray(I.queue) ? I.queue : [], pos = q.indexOf(leader);
    if (leader && I.cur === leader) return `${I.runner} is on the way here`;
    if (pos >= 0) return `called · #${pos + 1} in the runner's queue`;
    const st = String(I.state || '');
    if (!st || /waiting/i.test(st)) return `${I.runner}: waiting for calls`;
    return `${I.runner}: ${st.slice(0, 60)}${q.length ? ` · ${q.length} waiting` : ''}`;
  }
  const S = { info: null, at: 0, busy: false };
  function apply() {
    document.querySelectorAll('[data-runnercall]').forEach(b => {
      const leader = b.dataset.runnercall, d = decide(S.info, leader);
      b.disabled = !d.ok; b.title = d.ok ? `Call the runner (${S.info ? S.info.runner : ''}) to party ${leader}: it brings shots and takes loot back to the bank` : d.why;
      const s = b.parentElement && b.parentElement.querySelector(`[data-runnerstate="${CSS.escape(leader)}"]`);
      if (s) s.textContent = S.info ? (d.ok ? stateText(S.info, leader) : d.why) : '';
    });
  }
  async function refresh() {
    if (S.busy) return; S.busy = true;
    try { const k = new URLSearchParams(location.search).get('key'); const r = await fetch('/api/crafterpage?view=runner' + (k ? '&key=' + encodeURIComponent(k) : ''), { cache: 'no-store' }); if (r.ok) { S.info = await r.json(); S.at = Date.now(); } } catch (e) { }
    S.busy = false; apply();
  }
  function button(leader, small) {
    if (!leader) return '';
    const d = decide(S.info, leader), st = S.info ? (d.ok ? stateText(S.info, leader) : d.why) : '';
    return `<span class="rcwrap" style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;max-width:100%"><button type="button" class="rcbtn${small ? ' sm' : ''}" data-runnercall="${E(leader)}"${S.info && !d.ok ? ' disabled' : ''} title="${E(d.ok ? 'Call the runner to party ' + leader : d.why)}">🐎 Call the runner</button><small class="rcstate" data-runnerstate="${E(leader)}" style="opacity:.75;overflow-wrap:anywhere">${E(st)}</small></span>`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-runnercall]'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); if (b.disabled) return;
    const leader = b.dataset.runnercall, cmd = '!callrunner ' + leader, target = 'party:' + leader;
    const ok = typeof confirmOrder === 'function' ? await confirmOrder(target, cmd, 'Call the runner to party ' + leader) : true;
    if (!ok) return;
    if (typeof send === 'function') await send(target, null, cmd);
    setTimeout(refresh, 3000);
  }, true);
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  setTimeout(refresh, 500);
  window.RunnerCall = { button, refresh, decide, stateText, _state: S };
})();
