// TEAMS PAGE #/teams (TEAMS-2026-11-03, owner: "from now on I want an easy way to re-arrange the groups and teams across - should be extremely easy
// to do from mobile or pc. Selecting which should be able to do what."). Every party as a card (leader first, members with class icon, level,
// online, role chips). Tap a character -> Move to party / Make leader / What it does (roles) / Character page. PC: drag a character (or the selected
// ones) onto another party card. Phone: "Select several" -> tick -> "Move selected". Every change shows what changes first (the server's dry run),
// then confirms. "Undo the last move" puts the parties back as they were before the last move.
// Only EXISTING mechanics (owner: "don't make up new things we already have working"): moves = /api/partymove; roles = the existing settings APIs
// (/api/crafterpage settings: bank, crafter, runner + on, bank uses the clan warehouse; /api/storage: collector, letters receiver; /api/runstate:
// benched / party on-off; /api/powerlevel: power-level pairs). Data: GET /api/teams (Dashboard/teams_api.js).
(function () {
  'use strict';
  const SEC = 'tab-teams';
  const S = { open: false, d: null, timer: 0, err: '', multi: false, sel: new Set(), busy: false, q: '', msgT: 0 };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({}, o || {}, { headers: { 'x-key': (typeof KEY !== 'undefined' ? KEY : ''), 'Content-Type': 'application/json' } })).then(r => r.json()));
  const post = (u, b) => call(u, { method: 'POST', body: JSON.stringify(b) });
  const enc = encodeURIComponent;
  const CSS = `#tab-teams .tmp-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 10px}
#tab-teams .tmp-top input[type=search]{min-height:36px;flex:1 1 160px;min-width:0;max-width:260px}
#tab-teams .tmp-top button{min-height:36px}
#tab-teams .tmp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}
#tab-teams .tmp-card{border:1px solid rgba(255,255,255,.14);border-radius:6px;background:rgba(0,0,0,.2);padding:6px;min-width:0}
#tab-teams .tmp-card.drop{outline:2px dashed #c9a45a}
#tab-teams .tmp-ch{display:flex;gap:6px;align-items:center;justify-content:space-between;margin:0 0 4px;font-weight:bold}
#tab-teams .tmp-ch .tmp-on{font-weight:normal;font-size:12px;padding:1px 6px;border-radius:9px;background:rgba(255,255,255,.07)}
#tab-teams .tmp-ch .tmp-on.ok{color:#9fd59a}
#tab-teams .tmp-m{display:flex;gap:6px;align-items:center;padding:4px 2px;border-top:1px solid rgba(255,255,255,.06);min-height:40px;flex-wrap:wrap}
#tab-teams .tmp-m.sel{background:rgba(201,164,90,.16)}
#tab-teams .tmp-m img{width:22px;height:22px;flex:0 0 22px}
#tab-teams .tmp-m .tmp-nm{background:none;border:0;color:inherit;padding:4px 2px;font:inherit;cursor:pointer;text-decoration:underline dotted;min-height:32px}
#tab-teams .tmp-m .tmp-lv{opacity:.75;font-size:12px}
#tab-teams .tmp-dot{width:8px;height:8px;border-radius:50%;background:#666;flex:0 0 8px}#tab-teams .tmp-dot.on{background:#7cd17c}
#tab-teams .tmp-chips{display:flex;flex-wrap:wrap;gap:3px;flex:1 1 100%;margin-left:28px}
#tab-teams .tmp-chip{font-size:11px;padding:1px 6px;border-radius:9px;background:rgba(255,255,255,.08)}
#tab-teams .tmp-chip.g{background:#4a3c18;color:#ffe9a8}#tab-teams .tmp-chip.b{background:#20384a;color:#b8e0ff}#tab-teams .tmp-chip.r{background:#4a2420;color:#ffc4b8}
#tab-teams .tmp-msg{margin:6px 0;padding:6px;border-radius:4px;background:rgba(120,200,120,.15)}#tab-teams .tmp-msg.bad{background:rgba(230,120,90,.2)}
#tab-teams .muted{opacity:.7}
@media (max-width:600px){#tab-teams .tmp-grid{grid-template-columns:1fr}}`;
  function section() {
    let s = $id(SEC); if (s) return s;
    if (!$id('tmp-css')) { const st = document.createElement('style'); st.id = 'tmp-css'; st.textContent = CSS; document.head.appendChild(st); }
    s = document.createElement('section'); s.id = SEC; s.hidden = true;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('input', onInput); s.addEventListener('change', onChange);
    s.addEventListener('dragstart', onDragStart); s.addEventListener('dragover', onDragOver); s.addEventListener('dragleave', onDragLeave); s.addEventListener('drop', onDrop);
    return s;
  }
  function route(kind) { if (kind === 'teams') { open(); return true; } close(); return false; }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'teams'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'teams')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; render(); load();
    clearInterval(S.timer); S.timer = setInterval(() => { if (S.open && !document.hidden && !S.busy) load(); }, 15000);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.timer); const s = $id(SEC); if (s) s.hidden = true; }
  async function load() { try { const d = await call('/api/teams'); if (d && !d.error) { S.d = d; S.err = ''; } else S.err = (d && d.error) || 'no answer'; } catch (e) { S.err = e.message; } if (S.open && !S.busy) render(); }
  function flash(t, bad) { const m = $id('tmpMsg'); if (!m) return; m.hidden = !t; m.className = 'tmp-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; clearTimeout(S.msgT); S.msgT = setTimeout(() => { m.hidden = true; }, 9000); }
  const allMembers = () => (S.d ? S.d.parties.flatMap(p => p.members.map(m => Object.assign({ party: p.key, leader: p.leader }, m))) : []);
  const member = (n) => allMembers().find(m => m.name === n);
  function chips(r) {
    const c = [];
    if (r.bank) c.push(['g', 'bank']); if (r.crafter) c.push(['g', 'crafter']); if (r.runner) c.push([r.runnerOn ? 'g' : '', 'runner' + (r.runnerOn ? '' : ' (off)')]);
    if (r.collector) c.push(['g', 'collector']); if (r.letters) c.push(['g', 'letters']); if (r.cwh) c.push(['b', 'clan warehouse']); if (r.clanLeader) c.push(['b', 'clan leader']);
    if (r.plLeveler) c.push(['b', 'power-levels with ' + r.plWith + (r.plOn ? '' : ' (off)')]); if (r.plHealer) c.push(['b', 'heals ' + r.plWith + ' (power level)' + (r.plOn ? '' : ' (off)')]);
    if (r.spoiler) c.push(['', 'spoiler']); if (r.healerOnly) c.push(['', 'heals only']); if (r.benched) c.push(['r', 'benched']);
    return c.map(([k, t]) => `<span class="tmp-chip ${k}">${h(t)}</span>`).join('');
  }
  function render() {
    const s = section(), d = S.d;
    if (!d) { s.innerHTML = `<h2>Teams</h2><div class="muted">${S.err ? 'Could not load: ' + h(S.err) : 'Loading…'}</div>`; return; }
    const q = S.q.trim().toLowerCase(), U = d.undo;
    const top = `<h2>Teams</h2><div class="tmp-top">
      <input type="search" id="tmpQ" placeholder="Find a character or party…" value="${h(S.q)}" autocomplete="off">
      <button type="button" data-tmpmulti="1">${S.multi ? 'Done selecting' : 'Select several'}</button>
      ${S.multi ? `<button type="button" data-tmpmovesel="1" ${S.sel.size ? '' : 'disabled'}>Move selected (${S.sel.size})…</button>` : ''}
      ${U && U.moves && U.moves.length ? `<button type="button" data-tmpundo="1" title="${h(U.moves.map(m => `${m.name}: back to ${m.to}`).join(', '))}">Undo the last move</button>` : ''}
      </div><div class="muted" style="margin:-4px 0 8px">Tap a name to move it, make it the leader or choose what it does. On a PC you can also drag a name onto another party.</div>
      <div class="tmp-msg" id="tmpMsg" hidden></div>`;
    const cards = d.parties.map(p => {
      const ms = p.members.filter(m => !q || m.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || String(m.cls).toLowerCase().includes(q));
      if (!ms.length) return '';
      return `<div class="tmp-card" data-tmpparty="${h(p.key)}"><div class="tmp-ch"><span>${h(p.key)} <span class="muted" style="font-weight:normal">(${p.members.length})</span></span><span class="tmp-on ${p.on ? 'ok' : ''}">${p.on ? 'ON' : 'off'}</span></div>
        ${ms.map(m => `<div class="tmp-m${S.sel.has(m.name) ? ' sel' : ''}" draggable="true" data-tmpdrag="${h(m.name)}">
          ${S.multi ? `<input type="checkbox" data-tmpsel="${h(m.name)}" ${S.sel.has(m.name) ? 'checked' : ''} aria-label="select ${h(m.name)}">` : ''}
          <span class="tmp-dot${m.online ? ' on' : ''}" title="${m.online ? 'online' : 'offline'}"></span>
          ${m.classId != null ? `<img src="/icons/class/class_${Number(m.classId)}.png" alt="" onerror="this.style.visibility='hidden'">` : ''}
          <button type="button" class="tmp-nm" data-tmpname="${h(m.name)}">${h(m.name)}${m.name === p.leader ? ' ★' : ''}</button>
          <span class="tmp-lv">${m.level != null ? 'lvl ' + m.level : ''} ${h(m.cls)}</span>
          <div class="tmp-chips">${chips(m.roles)}</div></div>`).join('')}</div>`;
    }).join('');
    s.innerHTML = top + `<div class="tmp-grid">${cards || '<div class="muted">Nothing matches.</div>'}</div>`;
  }
  function onInput(e) { if (e.target.id === 'tmpQ') { S.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $id('tmpQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) { } } } }
  function onChange(e) { const n = e.target.dataset && e.target.dataset.tmpsel; if (n) { if (e.target.checked) S.sel.add(n); else S.sel.delete(n); render(); } }
  const guard = (fn) => async (...a) => { S.busy = true; try { await fn(...a); } catch (e) { flash(String(e && e.message || e), true); } finally { S.busy = false; load(); } };
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.tmpmulti) { S.multi = !S.multi; if (!S.multi) S.sel.clear(); render(); return; }
    if (b.dataset.tmpmovesel) { guard(moveChars)([...S.sel]); return; }
    if (b.dataset.tmpundo) { guard(undo)(); return; }
    if (b.dataset.tmpname) { guard(sheet)(b.dataset.tmpname); return; }
  }
  // ---- drag & drop (PC): a name (or the selected ones) onto another party card
  function onDragStart(e) { const r = e.target.closest && e.target.closest('[data-tmpdrag]'); if (!r) return; const n = r.dataset.tmpdrag; const names = S.sel.has(n) ? [...S.sel] : [n]; try { e.dataTransfer.setData('text/plain', JSON.stringify(names)); e.dataTransfer.effectAllowed = 'move'; } catch (x) { } }
  function onDragOver(e) { const c = e.target.closest && e.target.closest('[data-tmpparty]'); if (!c) return; e.preventDefault(); c.classList.add('drop'); }
  function onDragLeave(e) { const c = e.target.closest && e.target.closest('[data-tmpparty]'); if (c && !c.contains(e.relatedTarget)) c.classList.remove('drop'); }
  function onDrop(e) {
    const c = e.target.closest && e.target.closest('[data-tmpparty]'); if (!c) return; e.preventDefault(); c.classList.remove('drop');
    let names = []; try { names = JSON.parse(e.dataTransfer.getData('text/plain') || '[]'); } catch (x) { }
    names = names.filter(n => { const m = member(n); return m && m.party !== c.dataset.tmpparty; });
    if (names.length) guard(moveChars)(names, c.dataset.tmpparty);
  }
  // ---- the sheet for one character
  async function sheet(name) {
    const m = member(name); if (!m) return;
    const v = await uiChoice({ title: name, body: `${m.level != null ? 'Level ' + m.level + ' ' : ''}${m.cls || ''} · party ${m.party}${m.name === m.leader ? ' (leads it)' : ''}`,
      buttons: [{ label: 'Character page', value: 'page' }, { label: 'What it does…', value: 'roles' }].concat(m.name === m.leader ? [] : [{ label: `Make leader of ${m.party}`, value: 'lead' }]).concat([{ label: 'Move to party…', value: 'move', primary: true }]) });
    if (v === 'move') return moveChars([name]);
    if (v === 'lead') return makeLeader(name);
    if (v === 'roles') return roles(name);
    if (v === 'page') { location.hash = '#/char/' + enc(name); }
  }
  // ---- moves: the existing /api/partymove (dry run, then POST); several at once = members first, then leaders whose whole party moves along
  async function moveChars(names, to) {
    names = [...new Set(names)].filter(n => member(n)); if (!names.length) return;
    const d = S.d, ms = names.map(member);
    if (to === undefined) {
      const froms = new Set(ms.map(m => m.party));
      const opts = d.parties.filter(p => !(froms.size === 1 && froms.has(p.key))).map(p => ({ label: `${p.key} (${p.members.length}: ${p.members.slice(0, 4).map(x => x.name).join(', ')}${p.members.length > 4 ? ' …' : ''})`, value: p.key }));
      if (names.length === 1 && !d.parties.some(p => p.key === names[0])) opts.unshift({ label: `Its own new party (${names[0]} leads it)`, value: '' });
      const f = await uiForm({ title: names.length === 1 ? `Move ${names[0]}` : `Move ${names.length} characters`, body: names.join(', '), fields: [{ id: 'to', label: 'To', options: opts, value: opts[0] ? opts[0].value : '' }],
        buttons: [{ label: 'Next: see what changes', value: 'next', primary: true }] });
      if (!f || f.value !== 'next') return; to = f.values.to || '';
    }
    const moving = new Set(names), steps = [], lines = [];
    // members first (independent dry runs), then leaders
    const order = ms.slice().sort((a, b) => (a.name === a.leader ? 1 : 0) - (b.name === b.leader ? 1 : 0));
    for (const m of order) {
      let nl = '';
      const rest = d.parties.find(p => p.key === m.party).members.map(x => x.name).filter(x => x !== m.name);
      const restStays = rest.filter(x => !moving.has(x));
      if (m.name === m.leader && restStays.length) {
        const f = await uiForm({ title: `${m.name} leads ${restStays.join(', ')}`, body: 'Who leads the ones that stay?', fields: [{ id: 'nl', label: 'New leader', options: restStays.map(x => ({ label: x, value: x })), value: restStays[0] }],
          buttons: [{ label: 'OK', value: 'ok', primary: true }] });
        if (!f || f.value !== 'ok') return; nl = f.values.nl;
      }
      if (m.name === m.leader && rest.length && !restStays.length) { steps.push({ name: m.name, to, newLeader: '' }); lines.push(`${m.name} -> ${to || 'its own new party'} (after its members moved)`); continue; }
      const dry = await call(`/api/partymove?name=${enc(m.name)}&to=${enc(to)}${nl ? '&newLeader=' + enc(nl) : ''}`);
      if (!dry || dry.error || !dry.plan) throw new Error(`${m.name}: ${(dry && dry.error) || 'no answer'}`);
      if (!dry.plan.ok) throw new Error(`${m.name}: ${dry.plan.error}`);
      steps.push({ name: m.name, to, newLeader: nl }); dry.plan.changes.forEach(c => lines.push(c));
    }
    const ok = await uiConfirm({ title: names.length === 1 ? `Move ${names[0]} to ${to || 'its own new party'}?` : `Move ${names.length} characters to ${to || 'a new party'}?`,
      body: [uiP('What changes (backups first, in Settings\\backup\\partymove_…; "Undo the last move" puts the parties back):'), uiList(lines), uiNote('The bots read it within about a minute: the in-game parties change by themselves.')], confirmText: 'Move' });
    if (!ok) return;
    const done = [];
    for (const st of steps) {
      const r = await post('/api/partymove', { name: st.name, to: st.to, newLeader: st.newLeader, confirm: true, by: 'teams page' });
      if (!r || !r.ok) { flash(`${done.length ? done.join(', ') + ' moved; ' : ''}${st.name}: ${(r && r.error) || 'failed'}`, true); return; }
      done.push(st.name);
    }
    S.sel.clear(); flash(`Moved: ${done.join(', ')} -> ${to || 'own new party'}. The in-game parties follow within about a minute.`);
  }
  // make X the leader of its party = the leader hands the party to X (its own new party with X leading the rest), then the old leader joins X
  async function makeLeader(name) {
    const m = member(name); if (!m || m.name === m.leader) return;
    const L = m.leader;
    const dry = await call(`/api/partymove?name=${enc(L)}&to=&newLeader=${enc(name)}`);
    if (!dry || dry.error || !dry.plan || !dry.plan.ok) throw new Error((dry && (dry.error || (dry.plan && dry.plan.error))) || 'no answer');
    const ok = await uiConfirm({ title: `Make ${name} the leader?`, body: [uiP(`${name} leads the party, ${L} stays in it as a member. What changes:`), uiList(dry.plan.changes.concat([`then: ${L} joins ${name}'s party`]))], confirmText: 'Make leader' });
    if (!ok) return;
    let r = await post('/api/partymove', { name: L, to: '', newLeader: name, confirm: true, by: 'teams page' });
    if (!r || !r.ok) { flash(`${L}: ${(r && r.error) || 'failed'}`, true); return; }
    r = await post('/api/partymove', { name: L, to: name, confirm: true, by: 'teams page' });
    flash(r && r.ok ? `${name} leads the party now (${L} is a member).` : `${name} leads now, but ${L} could not join it: ${(r && r.error) || 'failed'}`, !(r && r.ok));
  }
  async function undo() {
    const U = S.d && S.d.undo; if (!U || !U.moves || !U.moves.length) return;
    const ok = await uiConfirm({ title: 'Undo the last move?', body: [uiP('These characters go back to the party they had before:'), uiList(U.moves.map(x => `${x.name}: ${x.from} -> ${x.to}`)), uiNote('Only the parties (and the moved characters\' class plans) change back - every other setting stays.')], confirmText: 'Undo' });
    if (!ok) return;
    const r = await post('/api/teams', { op: 'undo', confirm: true, by: 'teams page' });
    flash(r && r.ok ? `Undone: ${r.moves.map(x => x.name + ' -> ' + x.to).join(', ')}.` : (r && r.error) || 'failed', !(r && r.ok));
  }
  // ---- what a character does: the existing settings, one change at a time, each confirmed with what changes
  async function roles(name) {
    const m = member(name); if (!m) return; const R = m.roles, St = S.d.settings;
    const B = [];
    if (!R.bank) B.push({ label: `Make ${name} the bank`, value: 'bank' });
    if (!R.crafter) B.push({ label: `Make ${name} the crafter`, value: 'crafter' });
    if (!R.runner) B.push({ label: `Make ${name} the runner`, value: 'runner' }); else B.push({ label: R.runnerOn ? 'Switch the runner OFF' : 'Switch the runner ON', value: 'runneron' }, { label: 'No runner', value: 'norunner' });
    if (R.bank) B.push({ label: R.cwh ? 'Bank: stop taking from the clan warehouse' : 'Bank: take from the clan warehouse', value: 'cwh' });
    if (!R.collector) B.push({ label: `Make ${name} the collector`, value: 'collector' });
    if (!R.letters) B.push({ label: `Send all letters to ${name}`, value: 'letters' });
    if (m.name === m.leader) { const p = S.d.parties.find(x => x.key === m.party); B.push({ label: p && p.on ? `Switch party ${m.party} OFF` : `Switch party ${m.party} ON`, value: 'partyon' }); }
    else B.push({ label: R.benched ? `Unbench ${name}` : `Bench ${name} (stands still)`, value: 'bench' });
    if (R.plLeveler || R.plHealer) B.push({ label: R.plOn ? 'Stop the power-level pair' : 'Start the power-level pair', value: 'plonoff' }, { label: 'Remove the power-level pair', value: 'pldel' });
    else B.push({ label: 'Power level: pair with…', value: 'plpair' });
    const now = [R.bank && 'bank', R.crafter && 'crafter', R.runner && 'runner', R.collector && 'collector', R.letters && 'letters receiver', R.clanLeader && 'clan leader', R.spoiler && 'spoiler', R.healerOnly && 'heals only (its class)', R.benched && 'benched', R.plLeveler && `power-levels with ${R.plWith}`, R.plHealer && `power-level healer of ${R.plWith}`].filter(Boolean);
    const v = await uiChoice({ title: `What ${name} does`, body: now.length ? 'Now: ' + now.join(', ') : 'Now: nothing special (a normal member).', buttons: B });
    if (!v) return;
    const conf = (title, change) => uiConfirm({ title, body: [uiP('What changes:'), uiList([change])], confirmText: 'Change' });
    const settings = async (b, msg) => { const r = await post('/api/crafterpage', Object.assign({ action: 'settings' }, b)); flash(r && r.ok ? msg : (r && r.error) || 'failed', !(r && r.ok)); };
    if (v === 'bank') { if (await conf(`Make ${name} the bank?`, `crafter.json bank: ${St.bank || '-'} -> ${name} (holds the clan money, sells / crystallizes / stores the deliveries)`)) await settings({ bank: name }, `${name} is the bank.`); return; }
    if (v === 'crafter') { if (await conf(`Make ${name} the crafter?`, `crafter.json crafter: ${St.crafter || '-'} -> ${name}`)) await settings({ crafter: name }, `${name} is the crafter.`); return; }
    if (v === 'runner') { if (await conf(`Make ${name} the runner?`, `crafter.json runner: ${St.runner || '-'} -> ${name}, runner ON`)) await settings({ runner: name, runnerOn: true }, `${name} is the runner (ON).`); return; }
    if (v === 'runneron') { if (await conf(R.runnerOn ? 'Switch the runner OFF?' : 'Switch the runner ON?', `crafter.json runnerOn: ${R.runnerOn} -> ${!R.runnerOn}`)) await settings({ runnerOn: !R.runnerOn }, `Runner ${R.runnerOn ? 'OFF' : 'ON'}.`); return; }
    if (v === 'norunner') { if (await conf('No runner?', `crafter.json runner: ${name} -> (none)`)) await settings({ runner: '', runnerOn: false }, 'No runner now.'); return; }
    if (v === 'cwh') { if (await conf('Clan warehouse for the bank?', `crafter.json cwhWithdraw: ${R.cwh} -> ${!R.cwh}`)) await settings({ cwhWithdraw: !R.cwh }, 'Changed.'); return; }
    if (v === 'collector' || v === 'letters') {
      const g = await call('/api/storage'); if (!g || g.error || !g.rules) throw new Error((g && g.error) || 'the storage rules could not be read');
      const rules = JSON.parse(JSON.stringify(g.rules));
      let change;
      if (v === 'collector') { const c = Object.assign({}, rules.collector || {}); change = `stash_rules.json collector: ${c.on && c.name ? c.name : (c.on ? 'the clan leader' : 'off')} -> ${name} (on)`; rules.collector = Object.assign(c, { on: true, name }); }
      else { const L = Object.assign({}, rules.letters || {}); change = `stash_rules.json letters receiver: ${L.to || '-'} -> ${name}`; rules.letters = Object.assign(L, { to: name }); }
      if (!(await conf(v === 'collector' ? `Make ${name} the collector?` : `Send all letters to ${name}?`, change))) return;
      const r = await post('/api/storage', { rules, rev: g.rev }); flash(r && r.ok ? 'Changed.' : (r && (r.error || (r.errors || []).join('; '))) || 'failed', !(r && r.ok)); return;
    }
    if (v === 'bench') { if (await conf(R.benched ? `Unbench ${name}?` : `Bench ${name}?`, `run_state.json chars.${name}: ${R.benched ? 'benched -> back to its party switch' : 'stands still (benched)'}`)) { const r = await post('/api/runstate', { char: name, on: R.benched ? null : false }); flash(r && r.ok ? 'Changed.' : (r && r.error) || 'failed', !(r && r.ok)); } return; }
    if (v === 'partyon') { const p = S.d.parties.find(x => x.key === m.party); if (await conf(p.on ? `Switch party ${m.party} OFF?` : `Switch party ${m.party} ON?`, `run_state.json parties.${m.party}: ${p.on ? 'ON -> OFF (!stop)' : 'OFF -> ON (!start)'}`)) { const r = await post('/api/runstate', { party: m.party, on: !p.on }); flash(r && r.ok ? 'Changed.' : (r && r.error) || 'failed', !(r && r.ok)); } return; }
    const L = R.plLeveler ? name : R.plWith;
    if (v === 'plonoff') { if (await conf(R.plOn ? 'Stop the power-level pair?' : 'Start the power-level pair?', `powerlevel.json ${L}: ${R.plOn ? 'on -> off' : 'off -> on'}`)) { const r = await post('/api/powerlevel', { op: 'onoff', leveler: L, on: !R.plOn }); flash(r && r.ok ? 'Changed.' : (r && r.error) || 'failed', !(r && r.ok)); } return; }
    if (v === 'pldel') { if (await conf('Remove the power-level pair?', `powerlevel.json: the pair ${L} + ${R.plLeveler ? R.plWith : name} is removed`)) { const r = await post('/api/powerlevel', { op: 'delete', leveler: L }); flash(r && r.ok ? 'Removed.' : (r && r.error) || 'failed', !(r && r.ok)); } return; }
    if (v === 'plpair') {
      const others = allMembers().filter(x => x.party !== m.party && !x.roles.plLeveler && !x.roles.plHealer).map(x => ({ label: `${x.name} (${x.cls || '?'}${x.roles.healerOnly ? ', healer' : ''}, party ${x.party})`, value: x.name }));
      if (!others.length) throw new Error('nobody from another party is free for a pair');
      const f = await uiForm({ title: `Power level: ${name}`, body: 'The healer must be in ANOTHER party (it heals from outside). The pair is saved OFF - Start it here or on the Power level page.',
        fields: [{ id: 'as', label: `${name} is the`, options: [{ label: 'leveler (hunts, gets healed)', value: 'lv' }, { label: 'healer (heals the other one)', value: 'hl' }], value: m.roles.healerOnly ? 'hl' : 'lv' },
          { id: 'with', label: 'together with', options: others, value: others[0].value }], buttons: [{ label: 'Next', value: 'ok', primary: true }] });
      if (!f || f.value !== 'ok') return;
      const pair = f.values.as === 'hl' ? { leveler: f.values.with, healer: name } : { leveler: name, healer: f.values.with };
      if (!(await conf('Make the power-level pair?', `powerlevel.json: ${pair.leveler} levels, ${pair.healer} heals it from outside the party (saved OFF)`))) return;
      const r = await post('/api/powerlevel', { op: 'set', pair: Object.assign(pair, { on: false, aoe: false, healAt: 70, keepDist: 700, buffs: true }) }); flash(r && r.ok ? 'Pair saved (OFF).' : (r && r.error) || 'failed', !(r && r.ok));
    }
  }
  window.TeamsPage = { route, open, close, load, _state: S, _moveChars: moveChars, _roles: roles };
})();
