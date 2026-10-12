// ADD ACCOUNT (2026-10-12, public feature): the "+ Add account" form on the Accounts tab (#/accounts). One account (existing or new
// character, party, role, auto-start, log in now) or several at once (pasted "login;password;character;party;role" lines).
// Data: GET/POST /api/addaccount (Dashboard/addaccount_api.js). The password fields are sent once and emptied right after; nothing here
// stores them (no localStorage, no URL). Uses index.html globals: api, esc, $, and uidialog's uiConfirm / uiAlert / uiP / uiEm / uiList / uiNote.
(function () {
  'use strict';
  const A = { info: null, mode: 'one', busy: false, open: false };
  const id = (i) => document.getElementById(i);
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const LOGIN_RE = /^[A-Za-z0-9_]{3,32}$/, NAME_RE = /^[A-Za-z0-9]{2,16}$/;
  const RACES = ['Human', 'Elf', 'Dark Elf', 'Orc', 'Dwarf', 'Kamael'];
  const call = async (u, o) => {
    const r = await fetch(u, Object.assign({}, o || {}, { headers: { 'x-key': (typeof KEY !== 'undefined' ? KEY : ''), 'Content-Type': 'application/json' } }));
    let j = null; try { j = await r.json(); } catch (e) { j = { error: r.status === 401 ? 'access denied: open the dashboard with ?key=...' : 'HTTP ' + r.status }; }
    if (!r.ok && !j.error) j.error = 'HTTP ' + r.status;
    return j;
  };

  function mount() {
    const sec = id('tab-accounts'); if (!sec || id('aaPanel')) return;
    const head = sec.querySelector('.whead');
    const btn = document.createElement('button'); btn.id = 'aaOpen'; btn.type = 'button'; btn.className = 'aa-open'; btn.textContent = '+ Add account';
    if (head) head.appendChild(btn); else sec.prepend(btn);
    const panel = document.createElement('div'); panel.id = 'aaPanel'; panel.className = 'box aa'; panel.hidden = true;
    (head || btn).insertAdjacentElement('afterend', panel);
    btn.onclick = () => toggle(!A.open);
  }
  async function toggle(on) {
    A.open = on; const p = id('aaPanel'); if (!p) return;
    p.hidden = !on; id('aaOpen').classList.toggle('on', on);
    if (!on) { clearSecrets(); return; }
    p.innerHTML = '<div class="muted">Loading…</div>';
    const d = await call('/api/addaccount');
    if (d.error) { p.innerHTML = `<div class="aa-err">${h(d.error)}</div>`; return; }
    A.info = d; render();
  }
  function clearSecrets() {
    ['aaPw'].forEach(i => { const e = id(i); if (e) e.value = ''; });
    const t = id('aaBulk'); if (t) t.value = '';
  }

  // ------------------------------------------------------------------------------------------------ form
  const raceOpts = (sel) => RACES.map((r, i) => `<option value="${i}"${+sel === i ? ' selected' : ''}>${r}</option>`).join('');
  function classOpts(race, sex) {
    const L = (A.info.baseClasses || []).filter(c => c.race === +race && (!c.gender || (c.gender === 'M' ? +sex === 0 : +sex === 1)));
    return L.map(c => `<option value="${c.id}">${h(c.name)}</option>`).join('') || '<option value="">no start class for this race + sex</option>';
  }
  function roleOpts() { return (A.info.roles || []).map(r => `<option value="${h(r.value)}"${r.value === 'auto' ? ' selected' : ''}>${h(r.value)}${r.help ? ' — ' + h(r.help) : ''}</option>`).join(''); }
  function partyOpts() {
    return '<option value="">New party — this character leads it</option>' + (A.info.parties || []).map(p => `<option value="${h(p.leader)}">Party ${h(p.leader)} (${p.members.length})</option>`).join('');
  }
  function newCharBlock(pfx) {
    return `<div class="aa-grid aa-newchar" id="${pfx}New">
      <label>Race<select id="${pfx}Race">${raceOpts(0)}</select></label>
      <label>Sex<select id="${pfx}Sex"><option value="0">Male</option><option value="1">Female</option></select></label>
      <label>Start class<select id="${pfx}Class">${classOpts(0, 0)}</select></label></div>`;
  }
  function render() {
    const I = A.info, p = id('aaPanel');
    const warn = !I.configExists ? '<div class="aa-err">swarm.config.json is missing: set up the install first (docs/plan/INSTALL.md).</div>' : I.configBroken ? `<div class="aa-err">swarm.config.json does not parse: ${h(I.configBroken)}</div>` : '';
    p.innerHTML = `<h3>Add account</h3>${warn}
      <details class="aa-help"><summary>What happens when you press Add</summary>
        <ol>
          <li>An L2Swarm account config <code>Settings\\&lt;Login&gt;.xml</code> is made from the role's template. The password is stored there <b>only encrypted</b>,
            with L2Swarm's own encryption — the same way L2Swarm stores it when you add an account in L2Swarm itself. It is never written to
            <code>swarm.config.json</code>, a log or any other file, and the field is emptied right after.</li>
          <li>A <b>new character</b> is created by a small one-off script at the account's first login (progress: <code>Logs\\create_chars.txt</code>).</li>
          <li>The account is added to <code>swarm.config.json</code> (party, role, auto-start; a backup is kept in <code>Settings\\backup\\swarm_config_history</code>).</li>
          <li>Auto-start on: the <b>L2Swarm Start</b> task logs it in at every start (<code>Settings\\start_extra.txt</code>).</li>
          <li>"Log in right away": when L2Swarm runs, the new accounts log in now, one by one (${h(I.loginGap)} s apart); otherwise at the next start.</li>
        </ol>
        <div class="muted">The other characters of its party learn about a new member at their next script start (next deploy or L2Swarm start).</div>
      </details>
      <div class="aa-modes" role="tablist"><button type="button" data-aamode="one" class="${A.mode === 'one' ? 'on' : ''}">One account</button><button type="button" data-aamode="bulk" class="${A.mode === 'bulk' ? 'on' : ''}">Several at once</button></div>
      <form id="aaOne" class="aa-form" autocomplete="off" ${A.mode === 'one' ? '' : 'hidden'}>
        <div class="aa-grid">
          <label>Login<input id="aaLogin" maxlength="32" autocapitalize="off" spellcheck="false" placeholder="your game login"></label>
          <label>Password<input id="aaPw" type="password" maxlength="64" autocomplete="new-password" placeholder="kept encrypted"></label>
        </div>
        <fieldset class="aa-set"><legend>Character</legend>
          <label class="chk"><input type="radio" name="aaCm" value="existing" checked> Use an existing character</label>
          <label class="chk"><input type="radio" name="aaCm" value="new"> Create a new character</label>
          <label>Name<input id="aaChar" maxlength="16" autocapitalize="off" spellcheck="false" placeholder="exact name, 2-16 letters/digits"></label>
          <div id="aaNewWrap" hidden>${newCharBlock('aa')}</div>
        </fieldset>
        <div class="aa-grid">
          <label>Party<select id="aaParty">${partyOpts()}</select></label>
          <label>Role<select id="aaRole">${roleOpts()}</select></label>
        </div>
        <div class="aa-checks">
          <label class="chk"><input type="checkbox" id="aaAuto" checked> Auto-start (logged in by the start task)</label>
          <label class="chk"><input type="checkbox" id="aaNow"> Log in right away (if L2Swarm runs)</label>
        </div>
        <div id="aaErr" class="aa-err" aria-live="polite"></div>
        <div class="aa-act"><button type="submit" id="aaAdd">Add</button></div>
      </form>
      <form id="aaMany" class="aa-form" autocomplete="off" ${A.mode === 'bulk' ? '' : 'hidden'}>
        <label>One account per line: <code>login;password;character;party;role</code>
          <textarea id="aaBulk" rows="6" spellcheck="false" autocapitalize="off" placeholder="login1;password1;Charname1;;tank&#10;login2;password2;Charname2;Charname1;healer"></textarea></label>
        <div class="muted">Party empty = the character leads a new party (others in the list may name it). Role empty = auto. Lines starting with # are skipped.
          A password with <code>;</code> in it works when the line has all 5 fields.</div>
        <label class="chk"><input type="checkbox" id="aaBNewOn"> These characters do not exist yet — create them all as:</label>
        <div id="aaBNewWrap" hidden>${newCharBlock('aaB')}</div>
        <div class="aa-checks">
          <label class="chk"><input type="checkbox" id="aaBAuto" checked> Auto-start</label>
          <label class="chk"><input type="checkbox" id="aaBNow"> Log in right away (one by one)</label>
        </div>
        <div id="aaBErr" class="aa-err" aria-live="polite"></div>
        <div class="aa-act"><button type="button" id="aaCheck">Check</button><button type="submit" id="aaBAdd">Add all</button></div>
      </form>
      <div id="aaResult" class="aa-result" aria-live="polite"></div>`;
    wire();
  }
  function wireClass(pfx) {
    const r = id(pfx + 'Race'), s = id(pfx + 'Sex'), c = id(pfx + 'Class'); if (!r) return;
    const upd = () => { c.innerHTML = classOpts(r.value, s.value); };   // Kamael: the sex decides the start class (male / female soldier)
    r.onchange = upd; s.onchange = upd;
  }
  function wire() {
    id('aaPanel').querySelectorAll('[data-aamode]').forEach(b => { b.onclick = () => { A.mode = b.dataset.aamode; clearSecrets(); render(); }; });
    const one = id('aaOne'); if (!one) return;
    one.querySelectorAll('input[name=aaCm]').forEach(x => { x.onchange = () => { id('aaNewWrap').hidden = !(one.querySelector('input[name=aaCm]:checked').value === 'new'); }; });
    wireClass('aa'); wireClass('aaB');
    id('aaBNewOn').onchange = () => { id('aaBNewWrap').hidden = !id('aaBNewOn').checked; };
    one.onsubmit = (e) => { e.preventDefault(); submitOne(); };
    id('aaMany').onsubmit = (e) => { e.preventDefault(); submitBulk(false); };
    id('aaCheck').onclick = () => submitBulk(true);
  }

  // ------------------------------------------------------------------------------------------------ submit
  function oneRow() {
    const mode = (id('aaOne').querySelector('input[name=aaCm]:checked') || {}).value || 'existing';
    const r = { login: id('aaLogin').value.trim(), password: id('aaPw').value, character: id('aaChar').value.trim(), mode,
      party: id('aaParty').value, role: id('aaRole').value, autoStart: id('aaAuto').checked };
    if (mode === 'new') Object.assign(r, { race: +id('aaRace').value, sex: +id('aaSex').value, classId: id('aaClass').value === '' ? '' : +id('aaClass').value });
    return r;
  }
  function checkOne(r) {
    if (!LOGIN_RE.test(r.login)) return 'Login: 3-32 letters, digits or _.';
    if ((A.info.logins || []).includes(r.login.toLowerCase())) return `Login ${r.login} is already in swarm.config.json.`;
    if (!r.password) return 'Password: needed once (it is stored encrypted only).';
    if (!NAME_RE.test(r.character)) return 'Character name: 2-16 letters or digits.';
    if ((A.info.characters || []).some(c => c.toLowerCase() === r.character.toLowerCase())) return `${r.character} is already in swarm.config.json.`;
    if (r.mode === 'new' && r.classId === '') return 'Start class: pick one.';
    return '';
  }
  async function submitOne() {
    if (A.busy) return;
    const r = oneRow(), err = checkOne(r); id('aaErr').textContent = err; if (err) return;
    const cls = r.mode === 'new' ? ((A.info.baseClasses || []).find(c => c.id === r.classId) || {}).name : '';
    const ok = await uiConfirm({ title: `Add account ${r.login}?`, confirmText: 'Add account',
      body: [uiList([
        uiP('Character: ', uiEm(r.character), r.mode === 'new' ? ` — NEW ${cls} (${r.sex ? 'female' : 'male'}), created at the first login` : ' (exists already)'),
        uiP('Party: ', r.party ? uiEm(r.party) : uiEm('new party, ' + r.character + ' leads it')),
        uiP('Role: ', uiEm(r.role)),
        uiP('Auto-start: ', r.autoStart ? 'yes' : 'no', id('aaNow').checked ? ' · logs in right away when L2Swarm runs' : '')]),
        uiNote('The password is stored only encrypted inside the new L2Swarm config, like L2Swarm does itself.')] });
    if (!ok) return;
    await post({ accounts: [r], loginNow: id('aaNow').checked }, 'aaAdd');
    r.password = null; id('aaPw').value = '';
  }
  async function submitBulk(dry) {
    if (A.busy) return;
    const t = id('aaBulk').value; id('aaBErr').textContent = '';
    if (!t.trim()) { id('aaBErr').textContent = 'Paste one account per line first.'; return; }
    const nw = id('aaBNewOn').checked ? { race: +id('aaBRace').value, sex: +id('aaBSex').value, classId: id('aaBClass').value === '' ? '' : +id('aaBClass').value } : null;
    if (nw && nw.classId === '') { id('aaBErr').textContent = 'Start class: pick one.'; return; }
    const n = t.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length;
    if (!dry && !await uiConfirm({ title: `Add ${n} account${n === 1 ? '' : 's'}?`, confirmText: 'Add all',
      body: [uiP(nw ? 'Every character is created new as ' : 'The characters exist already', nw ? uiEm(((A.info.baseClasses || []).find(c => c.id === nw.classId) || {}).name + (nw.sex ? ' (female)' : ' (male)')) : '', '.'),
        uiP('Auto-start: ', id('aaBAuto').checked ? 'yes' : 'no', id('aaBNow').checked ? ` · logs in right away, one by one (${A.info.loginGap} s apart)` : ''),
        uiNote('Press Check first to see what would happen. Passwords are stored only encrypted inside each L2Swarm config; the list is emptied after Add.')] })) return;
    const body = { bulk: t, bulkNew: nw, autoStart: id('aaBAuto').checked, loginNow: id('aaBNow').checked, dryRun: !!dry };
    const d = await post(body, dry ? 'aaCheck' : 'aaBAdd');
    body.bulk = null;
    if (!dry) {
      // the list held passwords: empty it; lines that failed come back WITHOUT their password (type it again)
      const lines = t.replace(/\r/g, '').split('\n'); id('aaBulk').value = '';
      const failed = ((d && d.results) || []).filter(x => x.status === 'error').map(x => lines[(x.line || 0) - 1]).filter(Boolean).map(l => {
        const f = l.split(/;|\t/); if (f.length >= 5) return [f[0], '', f[f.length - 3], f[f.length - 2], f[f.length - 1]].join(';'); return [f[0], ''].concat(f.slice(2)).join(';'); });
      if (failed.length) { id('aaBulk').value = failed.join('\n'); id('aaBErr').textContent = 'The lines that failed are back in the list without their password: fix them, type the password again, press Add all.'; }
    }
  }
  async function post(body, btnId) {
    A.busy = true; const b = id(btnId); if (b) b.disabled = true;
    id('aaResult').innerHTML = `<div class="muted">${body.dryRun ? 'Checking…' : 'Adding… (each account takes a few seconds)'}</div>`;
    let d;
    try { d = await call('/api/addaccount', { method: 'POST', body: JSON.stringify(body) }); }
    catch (e) { d = { error: e.message }; }
    finally { body.password = null; if (body.accounts) body.accounts.forEach(a => { a.password = null; }); A.busy = false; if (b) b.disabled = false; }
    showResult(d);
    if (d && d.created) { try { const i2 = await call('/api/addaccount'); if (!i2.error) { A.info = i2; refreshLists(); } } catch (e) { } }
    return d;
  }
  function refreshLists() {
    const ps = id('aaParty'); if (ps) { const v = ps.value; ps.innerHTML = partyOpts(); if ([...ps.options].some(o => o.value === v)) ps.value = v; }
  }
  const BADGE = { created: ['ok', 'created'], ok: ['ok', 'ok'], exists: ['warn', 'already exists'], error: ['bad', 'error'] };
  function showResult(d) {
    const el = id('aaResult');
    if (!d || d.error) { el.innerHTML = `<div class="aa-err">${h((d && d.error) || 'failed')}</div>`; return; }
    const rows = (d.results || []).map(r => { const [cls, txt] = BADGE[r.status] || ['bad', r.status];
      return `<li class="aa-r"><span class="aa-b aa-${cls}">${h(txt)}</span> <b>${h(r.login || '?')}</b>${r.character ? ' · ' + h(r.character) : ''}${r.line ? ` <span class="muted">(line ${r.line})</span>` : ''}
        <div class="muted">${h(r.reason || '')}${r.loginState ? ' — ' + h(r.loginState) : ''}</div></li>`; }).join('');
    el.innerHTML = `<h3>${d.dryRun ? 'Check (nothing was changed)' : 'Result'}</h3><ul class="aa-list">${rows || '<li class="muted">nothing</li>'}</ul>${d.note ? `<div class="muted">${h(d.note)}</div>` : ''}`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.AddAccount = { open: () => toggle(true), close: () => toggle(false) };
})();
