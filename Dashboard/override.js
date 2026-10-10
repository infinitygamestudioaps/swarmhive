// USER OVERRIDE MENU (user 2026-10-09 09:50: "an override button to ask a person to cast a skill or take a mana potion etc." + "direct orders on the
// character page: use this skill NOW, take this potion / mana potion, use SoE NOW, drop this item"). A small reusable module: one panel for ONE
// character with its skills (ready / cooldown), its potions / scrolls, its bag (drop) and quick actions. Every action is ONE swarm command
// '!ov <name> <action> ...' sent through /api/command (MCP or the file channel) to that character only; swarm.js raidOverride() runs it once,
// any time (also mid-raid) and writes Logs/override_<name>.json, which this module polls (/api/override?name=) and shows as a toast.
//
// API (window.Override):
//   Override.open(name, anchorEl?, opts?)  open the panel for <name>. opts (all optional):
//       context   'raid' | 'char' (default 'char'): raid adds boss / focus targets and "move to tank / boss"
//       getData   () => { hp, mp, cp, role, dead, ov: { skills, items, inv }, ageSec, party: [{ name, dead, role }] } — live data; without it
//                 the module reads /api/override?name= every 2 s (swarm_state + the party)
//       skillName / onSent(name, cmd, response) / title
//   Override.close()                        close it (Esc, the ✕ and a tap outside do too)
//   Override.send(name, action, label, { danger })  send '!ov <name> <action>' without the panel (danger = typed YES first, for drop)
//   Override.toast(msg, ok)                 the same toast the results use
//   Override.isOpen(name?)                  true while the panel is open (for <name>)
// Needs from index.html: api(), esc(), skillIcon(), itemIcon(), fmtK(), GD (falls back gracefully). Styles: Dashboard/override.css.
(function () {
  'use strict';
  const S = { name: '', opts: {}, anchor: null, data: null, dataAt: 0, on: 'boss', pending: null, timer: 0, polls: {}, lastRes: {} };
  // 2026-10-09: names = the client data (Dashboard/data/items.json via GD.items, same as every other list); these are only the fallback
  // before GD has loaded, written as the client names them (1061 is 'Greater Healing Potion' in this client and on the server, not 'Healing Potion')
  const ITEMS = [[728, 'Mana Potion'], [1061, 'Greater Healing Potion'], [1539, 'Greater Healing Potion'], [5592, 'Greater CP Potion'], [5591, 'CP Potion'], [736, 'Scroll of Escape'], [737, 'Scroll of Resurrection']];
  const E = (s) => (typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const sIcon = (id) => typeof skillIcon === 'function' ? skillIcon(id) : '/icons/icon/etc_question_mark_i00.png';
  const iIcon = (id) => typeof itemIcon === 'function' ? itemIcon(id) : '/icons/icon/etc_question_mark_i00.png';
  const K = (n) => typeof fmtK === 'function' ? fmtK(n) : String(n);
  const sName = (id) => { try { if (S.opts.skillName) { const n = S.opts.skillName(id); if (n) return n; } } catch (e) { } try { return (GD.skills[id] || [])[0] || 'skill ' + id; } catch (e) { return 'skill ' + id; } };
  const iName = (id, fb) => { try { return (GD.items[id] || [])[0] || fb || 'item ' + id; } catch (e) { return fb || 'item ' + id; } };
  const call = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o || {})).then(r => r.json()));

  function el() {
    let d = document.getElementById('ovPanel');
    if (!d) { d = document.createElement('div'); d.id = 'ovPanel'; d.className = 'ov-panel'; d.hidden = true; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'false'); document.body.appendChild(d); }
    return d;
  }
  function toast(msg, ok) {
    let box = document.getElementById('ovToasts');
    if (!box) { box = document.createElement('div'); box.id = 'ovToasts'; box.className = 'ov-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'ov-toast ' + (ok === false ? 'bad' : ok === true ? 'ok' : ''); t.textContent = msg;
    box.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 6500);
  }
  /** After a send: poll the character's result file until a newer result arrives (max 25 s) -> toast. */
  function watch(name, since) {
    if (S.polls[name]) clearInterval(S.polls[name]);
    const t0 = Date.now();
    S.polls[name] = setInterval(() => {
      if (Date.now() - t0 > 25000) { clearInterval(S.polls[name]); delete S.polls[name]; toast(`${name}: no answer from its window yet (it may still run)`, null); return; }
      call('/api/override?name=' + encodeURIComponent(name)).then(d => {
        const r = d && d.result; if (!r || !r.at) return;
        const at = Date.parse(r.at); if (!(at >= since - 1500) || S.lastRes[name] === at) return;
        S.lastRes[name] = at; clearInterval(S.polls[name]); delete S.polls[name];
        toast(`${name}: ${r.msg}`, !!r.ok);
      }).catch(() => { });
    }, 1000);
  }
  /** Send '!ov <name> <action>'. danger = typed YES first (drop). */
  function send(name, action, label, o) {
    o = o || {};
    if (o.danger) return uiConfirm({ title: `${name}: ${label}`, body: 'This cannot be undone.', typeToConfirm: 'YES', danger: true, confirmText: 'Do it' })   // UIDIALOG 2026-10-10 (was a typed-YES prompt())
      .then(ok => { if (!ok) { toast(`${name}: ${label} — cancelled`, null); return null; } return send(name, action, label, Object.assign({}, o, { danger: false, confirmed: true })); });
    const cmd = `!ov ${name} ${action}`, since = Date.now();
    toast(`${name}: ${label} — sent…`);
    return call('/api/command', { method: 'POST', body: JSON.stringify(Object.assign({ target: 'char:' + name, cmd }, o.danger || o.confirmed ? { confirmDanger: true } : {})) })
      .then(d => {
        if (!d || !d.ok) toast(`${name}: not sent — ${(d && d.error) || 'error'}`, false);
        else if (d.sends && d.sends[0] && d.sends[0].ok === false && !d.sends[0].pending) toast(`${name}: ${d.sends[0].error || 'failed'}`, false);
        else watch(name, since);
        try { if (S.opts.onSent) S.opts.onSent(name, cmd, d); } catch (e) { }
        return d;
      })
      .catch(er => { toast(`${name}: not sent — ${er.message}`, false); return null; });
  }
  function getData() {
    if (S.opts.getData) { try { const d = S.opts.getData(); if (d) { S.data = d; return d; } } catch (e) { } }
    if (Date.now() - S.dataAt > 2000) {
      S.dataAt = Date.now();
      const nm = S.name;
      call('/api/override?name=' + encodeURIComponent(nm)).then(d => { if (S.name === nm && d && !d.error) { S.data = d; render(); } }).catch(() => { });
    }
    return S.data;
  }
  function render() {
    const d = el();
    if (!S.name) { d.hidden = true; return; }
    const D = getData() || {}, ov = D.ov || null, raid = S.opts.context === 'raid';
    const age = ((D.ageSec || 0)) * 1000;
    const party = (D.party || []).filter(p => p.name !== S.name);
    const tg = (raid ? ['boss', 'focus'] : ['target']).concat(['self'], party.filter(p => !p.dead).map(p => p.name));
    if (!tg.includes(S.on)) S.on = tg[0];
    const tsel = `<label class="ov-t">on <select data-ovon aria-label="skill target">${tg.map(t => `<option value="${E(t)}"${t === S.on ? ' selected' : ''}>${E(t === 'target' ? 'its current target' : t)}</option>`).join('')}</select></label>`;
    const skills = ov && ov.skills ? ov.skills.filter(s => !s.tog) : (D.keySkills || []).map(id => ({ id, ready: null, cd: 0 }));
    const sk = skills.map(s => {
      const left = s.cd ? Math.max(0, s.cd - age) : 0, ready = s.ready === null ? null : (s.ready || left <= 0);
      return `<button type="button" class="ov-b ${ready === false ? 'cd' : ''}" data-ovact="cast ${s.id} {on}" data-ovlbl="${E(sName(s.id))} on {on}" title="${E(sName(s.id))}${s.mp ? ' · ' + s.mp + ' MP' : ''}${ready === false ? ' · ready in ' + Math.ceil(left / 1000) + ' s' : ready === null ? ' · state unknown' : ' · ready'}">` +
        `<img src="${sIcon(s.id)}" alt=""><span>${E(sName(s.id))}</span>${ready === false ? `<b>${Math.ceil(left / 1000)}s</b>` : ''}</button>`;
    }).join('');
    const items = ov && ov.items ? ov.items : ITEMS.map(([id, nm]) => ({ id, name: nm, n: null }));
    const it = items.map(x => `<button type="button" class="ov-b" data-ovact="use ${x.o || x.id}" data-ovlbl="use ${E(iName(x.id, x.name))}" ${x.n === 0 ? 'disabled' : ''} title="${E(iName(x.id, x.name))} (#${x.id})${x.n != null ? ' · ' + x.n + ' in the bag' : ' · count unknown'}"><img src="${iIcon(x.id)}" alt=""><span>${E(iName(x.id, x.name))}</span>${x.n != null ? `<b class="n">${K(x.n)}</b>` : ''}</button>`).join('');
    const dead = party.filter(p => p.dead);
    const quick = (raid ? [['target boss', 'Target the boss'], ['target focus', 'Target the focus'], ['attack', 'Attack (focus / boss)']] : [['attack', 'Attack its target']])
      .concat([['stop', 'Stop attacking'], ['soe', 'Scroll of Escape NOW']], raid ? [['move tank', 'Move to the tank'], ['move boss', 'Move to the boss']] : [['move ' + ((party[0] || {}).name || 'self'), 'Move to ' + ((party[0] || {}).name || '…')]])
      .concat(dead.map(p => ['res ' + p.name, 'Resurrect ' + p.name]))
      .filter(([c]) => !/^move self$/.test(c))
      .map(([c, l]) => `<button type="button" class="ov-q ${c === 'soe' ? 'warn' : ''}" data-ovact="${E(c)}" data-ovlbl="${E(l)}">${E(l)}</button>`).join('');
    const inv = !raid && ov && ov.inv ? ov.inv : null;
    const drop = inv ? `<details class="ov-s ov-drop"><summary>Drop an item <span class="muted">(asks for a typed YES; equipped and quest items are never listed)</span></summary><div class="ov-g">${inv.map(x => `<button type="button" class="ov-b danger" data-ovdrop="${x.o}" data-ovid="${x.id}" data-ovn="${x.n}" title="drop ${E(iName(x.id))}"><img src="${iIcon(x.id)}" alt=""><span>${E(iName(x.id))}</span><b class="n">${K(x.n)}</b></button>`).join('') || '<span class="muted">nothing droppable</span>'}</div></details>` : '';
    const pend = S.pending ? `<div class="ov-c" role="alertdialog"><span>${E(S.name)}: <b>${E(S.pending.label)}</b>?</span><button type="button" class="ov-yes" data-ovgo="1">Do it</button><button type="button" data-ovgo="0">Cancel</button></div>` : '';
    const html = `<div class="ov-h"><b>${E(S.opts.title || S.name)}</b><span class="muted">${D.hp != null ? 'HP ' + D.hp + '% · ' : ''}${D.mp != null ? 'MP ' + D.mp + '%' : ''}${D.dead ? ' · dead' : ''}</span><button type="button" class="ov-x" data-ovclose aria-label="close">✕</button></div>
      ${pend}<div class="muted ov-note">Runs ONCE on ${E(S.name)} only, right now${raid ? ', even mid-raid' : ''}; then it carries on with what it was doing.${ov ? '' : ' Skill / item lists are a guess until its swarm.js reports them.'}</div>
      <div class="ov-s"><div class="ov-hd">Skills ${tsel}</div><div class="ov-g">${sk || '<span class="muted">no skills known yet</span>'}</div></div>
      <div class="ov-s"><div class="ov-hd">Potions / scrolls</div><div class="ov-g">${it}</div></div>
      <div class="ov-s"><div class="ov-hd">Quick</div><div class="ov-qr">${quick}</div></div>${drop}`;
    if (typeof patch === 'function') patch(d, html); else d.innerHTML = html;
    d.hidden = false;
    place(d);
  }
  function place(d) {
    if (window.innerWidth < 640 || !S.anchor || !document.body.contains(S.anchor)) { d.classList.add('sheet'); d.style.left = d.style.top = ''; return; }
    d.classList.remove('sheet');
    const r = S.anchor.getBoundingClientRect(), w = d.offsetWidth || 440, h = d.offsetHeight || 400;
    let x = r.right + 8; if (x + w > window.innerWidth - 8) x = Math.max(8, r.left - w - 8);
    let y = Math.min(Math.max(8, r.top - 20), window.innerHeight - h - 8);
    d.style.left = Math.round(x) + 'px'; d.style.top = Math.round(Math.max(8, y)) + 'px';
  }
  function open(name, anchorEl, opts) {
    S.name = name; S.anchor = anchorEl || null; S.opts = opts || {}; S.pending = null; S.data = null; S.dataAt = 0;
    render();
    clearInterval(S.timer); S.timer = setInterval(() => { if (!S.name) { clearInterval(S.timer); return; } render(); }, 1000);
    setTimeout(() => { const f = el().querySelector('button'); if (f) f.focus({ preventScroll: true }); }, 0);
  }
  function close() { S.name = ''; S.pending = null; clearInterval(S.timer); render(); if (S.anchor && S.anchor.focus) try { S.anchor.focus({ preventScroll: true }); } catch (e) { } }
  document.addEventListener('click', async (e) => {
    const t = e.target; if (!t || !t.closest || !S.name) return;
    const p = t.closest('#ovPanel');
    if (!p) { if (!t.closest('[data-ovopen],[data-rlhovopen]')) close(); return; }
    if (t.closest('[data-ovclose]')) { close(); return; }
    const a = t.closest('[data-ovact]');
    if (a && !a.disabled) { S.pending = { act: a.dataset.ovact.replace('{on}', S.on === 'target' ? '' : S.on).trim(), label: a.dataset.ovlbl.replace(' on {on}', S.on === 'target' ? '' : ' on ' + S.on) }; render(); return; }
    const dr = t.closest('[data-ovdrop]');
    if (dr) {
      const n = +dr.dataset.ovn || 1, who = S.name, nm = iName(+dr.dataset.ovid); let cnt = n;
      if (n > 1) { const v = await uiPrompt({ title: `Drop ${nm}?`, body: `${who}: drop how many ${nm}? (1-${n})`, label: 'How many', value: String(n), inputmode: 'numeric', type: 'text', confirmText: 'Next',
          validate: (v) => (/^\s*\d+\s*$/.test(v) && +v >= 1 && +v <= n ? '' : `A whole number from 1 to ${n}`) }); if (v === null) return; cnt = Math.max(1, Math.min(n, parseInt(v, 10) || 0)); if (!cnt) return; }
      send(who, `drop ${dr.dataset.ovdrop} ${cnt}`, `DROP ${iName(+dr.dataset.ovid)} ×${cnt} on the ground`, { danger: true });
      return;
    }
    const g = t.closest('[data-ovgo]');
    if (g) { const pd = S.pending; S.pending = null; if (g.dataset.ovgo === '1' && pd) send(S.name, pd.act, pd.label); render(); }
  });
  document.addEventListener('change', (e) => { if (e.target && e.target.matches && e.target.matches('[data-ovon]')) { S.on = e.target.value; render(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.name) close(); });
  window.addEventListener('resize', () => { if (S.name) place(el()); });
  window.Override = { open, close, send, toast, isOpen: (n) => !!S.name && (!n || S.name === n), version: '2026-10-09' };
})();
