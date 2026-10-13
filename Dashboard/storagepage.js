// STORAGE page #/storage (STORAGE-2026-10-13, owner: "Dagger1 must store EVERYTHING in the clan warehouse ... selectable", "everyone may give him
// all letters", "configure them to store things in their OWN warehouse if they are not in the clan", "everything must be configurable"; owner rule
// 17:0x: "nothing happens automatically unless you ask for it": every automatic part shows "off — nothing happens until you switch it on").
// Edits Scripts/data/stash_rules.json (read live by every bot: swarm.js STASH-PURE stashSettings / stashLettersCfg): defaults, per party, per character
// (destination, what, automatic + trigger, town, item rules), the event letters hand-over. Per character: Plan (dry run = !stashplan <name>, the
// result is shown), Store now (!stash <name>), Letters now (!letters <name>), preset "everything to the clan warehouse".
// Data: Dashboard/storagepage_api.js (GET/POST /api/storage, GET /api/storage/plan?name=). Uses index.html globals: esc, api, iconUrl, stopChar, TAB,
// and uidialog's uiConfirm / uiAlert / uiError / uiList / uiP / uiEm / uiWarn / uiNote / uiH / uiKV. No browser alert / confirm / prompt.
(function () {
  'use strict';
  const SEC = 'tab-storagepage';
  const SP = { open: false, info: null, orig: null, cur: null, rev: '', busy: false, timer: 0, msgT: 0, openParties: new Set(), openChars: new Set(), err: {} };
  const $id = (i) => document.getElementById(i);
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const ico = (p) => (typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png');
  const clone = (o) => JSON.parse(JSON.stringify(o == null ? {} : o));
  const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  const isSet = (v) => v !== undefined && v !== null && v !== '';
  const DESTS = { auto: 'Auto (clan if member)', clan: 'Clan', private: 'Own (private)' };
  const MODES = { rules: 'Smart rules', all: 'All but consumables', off: 'Off (nothing)' };
  const TRIG = { bag: 'Bag > N kinds', weight: 'Weight > N %', supply: 'Supply runs only', town: 'Idle in its town' };
  const TRIG_DEF = { kind: 'bag', above: 120, weightPct: 70, gapMin: 30 };
  const KEEP_CONSUMABLES = ['Soulshot', 'Spiritshot', 'Blessed Spiritshot', 'Scroll of Escape', 'Scroll of Resurrection', 'Blessed Scroll of', 'Potion', 'Arrow$', 'Bolt$', 'Spirit Ore', 'Elixir', 'Herb of', 'Scroll: Recovery'];

  /** = swarm.js stashSettings / storagepage_api.js effective (chars > parties > defaults > old "dest" > built-in) */
  function eff(rules, name, party) {
    const R = obj(rules), B = (SP.info && SP.info.base) || { dest: 'private', auto: false, above: 120 }, Df = obj(R.defaults), P = obj(obj(R.parties)[party]), C = name ? obj(obj(R.chars)[name]) : {};
    const L = [['character', C], ['party', P], ['default', Df]];
    const pick = (k, ok) => { for (const [src, o] of L) if (isSet(o[k]) && ok(o[k])) return { v: o[k], src }; return null; };
    const okDest = (v) => !!DESTS[String(v).toLowerCase()];
    const dest = pick('dest', okDest) || (isSet(R.dest) && okDest(R.dest) ? { v: R.dest, src: 'file default' } : { v: okDest(B.dest || '') ? B.dest : 'private', src: 'built-in' });
    const mode = pick('mode', v => !!MODES[v]) || { v: 'rules', src: 'built-in' };
    const auto = pick('auto', v => typeof v === 'boolean') || { v: B.auto === true, src: 'built-in' };
    const town = pick('town', v => /^[A-Za-z][A-Za-z ]{1,19}$/.test(String(v))) || { v: 'Giran', src: 'built-in' };
    const trig = Object.assign({}, TRIG_DEF, Number(B.above) > 0 ? { above: Number(B.above) } : {});
    L.slice().reverse().forEach(([, o]) => { const t = obj(o.trigger); if (TRIG[t.kind]) trig.kind = t.kind; ['above', 'weightPct', 'gapMin'].forEach(k => { const n = Number(t[k]); if (isSet(t[k]) && isFinite(n) && n >= 0) trig[k] = n; }); });
    return { dest: String(dest.v).toLowerCase(), mode: String(mode.v), auto: !!auto.v, trigger: trig, town: String(town.v), src: { dest: dest.src, mode: mode.src, auto: auto.src, town: town.src } };
  }
  const comparable = (r) => { const o = clone(r); delete o._updated; return JSON.stringify(o); };
  const dirty = () => SP.cur && SP.orig && comparable(SP.cur) !== comparable(SP.orig);

  // ============================================================================================ data
  async function load(keepEdits) {
    let d = null;
    try { d = await api('/api/storage'); } catch (e) { flash('The dashboard server has no Storage API yet (it needs a restart).', true); render(); return; }
    if (!d || d.error) { flash((d && d.error) || 'no answer', true); render(); return; }
    if (d.broken) flash(`stash_rules.json does not parse (${d.broken}) — saving is blocked until it is fixed or restored from Scripts/data/history/.`, true);
    SP.info = d;
    if (!keepEdits || !dirty()) { SP.orig = clone(d.rules); SP.cur = clone(SP.orig); SP.rev = d.rev; SP.err = {}; }
    else if (d.rev !== SP.rev) flash('Someone else saved the storage settings meanwhile. Undo your changes to see theirs, or save to overwrite (you will be asked).', true);
    render();
  }

  // ============================================================================================ frame
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win cpl fnd stg'; s.hidden = true;
    s.innerHTML = `<div class="cpl-headrow fnd-head"><h2><img class="gi" src="${ico('icon/etc_equip_item_box_i00')}" alt=""> Storage</h2>
        <span class="muted cpl-intro">What each character puts into a warehouse, which warehouse, and when. Settings are read live by every bot.</span></div>
      <div class="cpl-msg" id="stgMsg" role="status" hidden></div>
      <div class="box"><h3>Defaults (every character)</h3><div class="fnd-hint">A party's own setting beats these; a character's own setting beats its party's. Blank = the next level decides.</div><div id="stgDef"></div></div>
      <div class="box"><h3>Event letters</h3><div id="stgLet"></div></div>
      <div class="box"><h3>Per party and character</h3><div class="fnd-parties" id="stgParties"></div></div>
      <details class="box cpl-help"><summary><h3>How it works</h3></summary><div class="cpl-helpbody">
        <p><b>Warehouse.</b> <i>Clan</i> = the clan warehouse (only clan members can put items in; <b>only the clan leader can take items out</b> on L2Toggle, and untradeable items never go in). <i>Own</i> = the character's private warehouse. <i>Auto</i> = clan for clan members, otherwise its own. A character set to <i>Clan</i> that is not in a clan uses its own warehouse.</p>
        <p><b>What.</b> <i>Smart rules</i> = crafting materials (not for the crafter), recipes it cannot use, seal stones, ancient adena, event letters, old gear nobody plans; consumables, upgrades and unknown items stay. <i>Everything except my consumables</i> = all of the bag except shots, scrolls of escape / resurrection, potions, arrows, enchant scrolls and what its own keep list names. Worn items, quest items and adena always stay. Item rules (keep / store names or ids) beat both.</p>
        <p>In the selects, <b>↑</b> = not set here: the party's / the defaults' value shown is used.</p>
        <p><b>Automatic.</b> Off by default: nothing happens until you switch it on. When on, the character stores by itself when the trigger is met and it is idle in Giran or its town — never in raids, the raid circuit, instances, quests, fights, trades or while one of your orders runs. "At every supply run" stores only in the supply run's warehouse step. The raid circuit's warehouse step uses the same settings.</p>
        <p><b>Letters.</b> When on, every character hands its event letters to the receiver whenever both are idle in the same town (nobody travels for it). The receiver then stores them like everything else, or keeps them for the exchange.</p>
        <p>Buttons: <b>Plan</b> = a dry run (nothing moves; the list is shown here). <b>Store now</b> = <code>!stash &lt;name&gt;</code> (a leader / solo character outside Giran goes there first). Fee: 30 adena per item.</p>
      </div></details>
      <div class="fnd-bar" id="stgBar"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('change', onChange);
    s.addEventListener('toggle', (e) => { const d = e.target; if (!d || !d.dataset) return; const set = d.dataset.stgparty ? SP.openParties : d.dataset.stgchar ? SP.openChars : null; if (!set) return; const k = d.dataset.stgparty || d.dataset.stgchar; if (d.open) set.add(k); else set.delete(k); }, true);
    return s;
  }
  function route(kind) { if (kind === 'storage') { open(); return true; } close(); return false; }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'storage'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'storage')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const was = SP.open; s.hidden = false; SP.open = true;
    if (!was) window.scrollTo(0, 0);
    if (!SP.timer) SP.timer = setInterval(() => { if (SP.open && !document.hidden) refresh(); }, 30000);
    render(); load(true);
  }
  function close() { if (!SP.open) return; SP.open = false; clearInterval(SP.timer); SP.timer = 0; const s = $id(SEC); if (s) s.hidden = true; }
  function flash(t, bad) {
    const m = $id('stgMsg'); if (!m) return;
    m.hidden = !t; m.className = 'cpl-msg' + (bad ? ' bad' : ''); m.textContent = t || '';
    clearTimeout(SP.msgT); SP.msgT = setTimeout(() => { const x = $id('stgMsg'); if (x) x.hidden = true; }, bad ? 15000 : 7000);
  }
  async function refresh() {
    let d = null; try { d = await api('/api/storage'); } catch (e) { return; }
    if (!d || d.error || !SP.open) return;
    SP.info = d;
    if (!dirty() && d.rev !== SP.rev) { SP.orig = clone(d.rules); SP.cur = clone(SP.orig); SP.rev = d.rev; }
    const a = document.activeElement, s = $id(SEC);
    if (a && s && s.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;   // never redraw under the cursor / phone keyboard
    render();
  }

  // ============================================================================================ editors
  /** one settings level: pfx = 'defaults' | 'parties|<leader>' | 'chars|<name>'; inh = the inherited effective settings (for "— party / default (x)") */
  function levelEditor(pfx, lvl, inh, top) {
    const L = obj(lvl), t = obj(L.trigger), it = inh.trigger;
    const blank = (txt) => `<option value="">${h(top ? txt + ' (not set)' : '↑ ' + txt)}</option>`;   // ↑ = inherited from the party / defaults
    const sel = (key, opts, cur, inhTxt, label) => `<select data-stg="${h(pfx + '|' + key)}" aria-label="${h(label)}">${blank(inhTxt)}${Object.keys(opts).map(k => `<option value="${h(k)}" ${String(cur) === k ? 'selected' : ''}>${h(opts[k])}</option>`).join('')}</select>`;
    const num = (key, cur, ph, label, lo, hi) => `<input type="number" inputmode="numeric" min="${lo}" max="${hi}" class="fnd-amt" data-stg="${h(pfx + '|' + key)}" data-num="${lo},${hi}" value="${isSet(cur) ? h(cur) : ''}" placeholder="${h(ph)}" aria-label="${h(label)}">`;
    const autoCur = typeof L.auto === 'boolean' ? (L.auto ? 'on' : 'off') : '';
    const autoInh = inh.auto ? 'On' : 'Off — nothing happens until you switch it on';
    const field = (label, inner, hint) => `<label class="fnd-f"><span class="fl">${h(label)}</span>${inner}${hint ? `<span class="fh">${hint}</span>` : ''}</label>`;
    const kind = t.kind || it.kind;
    return `<div class="fnd-grid sm stg-lvl">
      ${field('Warehouse', sel('dest', DESTS, L.dest, DESTS[inh.dest] || inh.dest, 'warehouse'))}
      ${field('What to store', sel('mode', MODES, L.mode, MODES[inh.mode] || inh.mode, 'what to store'))}
      ${field('Automatic', `<select data-stg="${h(pfx + '|auto')}" aria-label="automatic" class="${(autoCur || (inh.auto ? 'on' : 'off')) === 'on' ? 'stg-on' : 'stg-off'}">${blank(autoInh)}<option value="on" ${autoCur === 'on' ? 'selected' : ''}>On — stores by itself</option><option value="off" ${autoCur === 'off' ? 'selected' : ''}>Off — only when you order it</option></select>`)}
      ${field('When (trigger)', sel('trigger|kind', TRIG, t.kind, TRIG[it.kind] || it.kind, 'trigger'))}
      ${kind === 'bag' ? field('Bag kinds above', num('trigger|above', t.above, String(it.above), 'bag kinds above', 1, 500)) : ''}
      ${kind === 'weight' ? field('Weight above %', num('trigger|weightPct', t.weightPct, String(it.weightPct), 'weight percent', 1, 100)) : ''}
      ${field('At most every (min)', num('trigger|gapMin', t.gapMin, String(it.gapMin), 'minutes between automatic stores', 0, 1440))}
      ${field('Town', sel('town', Object.fromEntries(((SP.info && SP.info.towns) || ['Giran']).map(x => [x, x])), L.town, inh.town, 'town'), 'Giran always works')}
    </div>`;
  }
  const effLine = (e, clan) => {
    const kind = e.dest === 'private' ? 'own warehouse' : clan ? 'clan warehouse' : (e.dest === 'clan' ? 'own warehouse (not in a clan)' : 'own warehouse');
    return `<span class="stg-eff"><b>${h(kind)}</b> · ${h(e.mode === 'all' ? 'everything except consumables' : e.mode === 'off' ? 'stores nothing' : 'smart rules')} · ${e.auto ? `<span class="stg-autoon">automatic: ${h(TRIG[e.trigger.kind] ? TRIG[e.trigger.kind].replace('N', e.trigger.kind === 'weight' ? e.trigger.weightPct : e.trigger.above) : e.trigger.kind)}</span>` : '<span class="stg-autooff">automatic off</span>'}</span>`;
  };

  // ============================================================================================ render
  function render() {
    if (!SP.open) return;
    if (!SP.cur) { ['stgDef', 'stgLet', 'stgParties'].forEach(i => { const e = $id(i); if (e) e.innerHTML = '<div class="muted">Loading…</div>'; }); renderBar(); return; }
    renderDef(); renderLetters(); renderParties(); renderBar();
  }
  function renderDef() {
    const el = $id('stgDef'); if (!el) return;
    const R = SP.cur, inh = eff(Object.assign({}, R, { defaults: {} }), '', '');
    el.innerHTML = levelEditor('defaults', R.defaults, inh, true) + `<div class="fnd-hint">Every character now: ${effLine(eff(R, '', ''), true)}</div>`;
  }
  function renderLetters() {
    const el = $id('stgLet'); if (!el) return;
    const L = obj(SP.cur.letters), on = L.on === true, CL = (SP.info && SP.info.clanLeader) || '', items = (SP.info && SP.info.letterItems) || [];
    const ids = new Set(Array.isArray(L.ids) && L.ids.length ? L.ids.map(Number) : items.map(i => i.id)), ex = new Set(Array.isArray(L.except) ? L.except : []);
    const all = []; ((SP.info && SP.info.parties) || []).forEach(p => p.members.forEach(m => all.push(m)));
    const to = String(L.to || 'clanleader'), recv = to === 'clanleader' ? CL : to;
    const holders = all.filter(m => m.letters > 0 && m.name !== recv);
    el.innerHTML = `<label class="fnd-sw"><input type="checkbox" data-stglet="on" ${on ? 'checked' : ''}><span class="tr" aria-hidden="true"></span><span class="lb ${on ? 'on' : 'off'}">${on ? `On — everyone hands its letters to ${h(recv || '?')}` : 'Off — nothing happens until you switch it on'}</span></label>
      <div class="fnd-grid sm">
        <label class="fnd-f"><span class="fl">Receiver</span><select data-stglet="to" aria-label="letters receiver"><option value="clanleader" ${to === 'clanleader' ? 'selected' : ''}>The clan leader${CL ? ' (' + h(CL) + ')' : ''}</option>${all.map(m => `<option value="${h(m.name)}" ${to === m.name ? 'selected' : ''}>${h(m.name)}</option>`).join('')}</select></label>
        <label class="fnd-f"><span class="fl">Receiver keeps them</span><select data-stglet="keep" aria-label="receiver keeps letters"><option value="0" ${L.keep ? '' : 'selected'}>No — stores them (its storage settings)</option><option value="1" ${L.keep ? 'selected' : ''}>Yes — keeps them for the exchange</option></select></label>
        <label class="fnd-f"><span class="fl">At most every (min)</span><input type="number" inputmode="numeric" min="0" max="1440" class="fnd-amt" data-stglet="gapMin" value="${isSet(L.gapMin) ? h(L.gapMin) : ''}" placeholder="10" aria-label="letters minutes"></label>
      </div>
      <div class="fnd-sub">Which items (tap to switch)</div>
      <div class="trd-row">${items.map(i => `<button type="button" class="trd-chip fnd-chip stg-item ${ids.has(i.id) ? 'on' : ''}" data-stgitem="${i.id}" aria-pressed="${ids.has(i.id)}">${i.icon ? `<img class="gi" src="${ico(i.icon)}" alt="">` : ''}${h(String(i.name).replace(/^L2Day - /, ''))}</button>`).join('')}</div>
      <details class="fnd-more" ${ex.size ? 'open' : ''}><summary>Never hand over (${ex.size})</summary><div class="trd-row">${all.map(m => `<button type="button" class="trd-chip fnd-chip ${ex.has(m.name) ? 'on' : ''}" data-stgex="${h(m.name)}" aria-pressed="${ex.has(m.name)}">${h(m.name)}</button>`).join('')}</div></details>
      <div class="fnd-hint">${holders.length ? `Holding letters now: ${holders.map(m => `${h(m.name)} ${m.letters}`).join(', ')}` : 'Nobody else reports letters in its bag right now.'} · Letters move only when the giver and ${h(recv || 'the receiver')} are idle in the same town.</div>`;
  }
  function charRow(m, party) {
    const R = SP.cur, c = obj(obj(R.chars)[m.name]), inh = eff(Object.assign({}, R, { chars: {} }), m.name, party), e = eff(R, m.name, party);
    const wh = m.wh && m.wh.last ? `last store ${String(m.wh.last.at || '').slice(5, 16).replace('T', ' ')}: ${m.wh.last.n} kinds${m.wh.last.ok === false ? ' — ' + h(m.wh.last.why || 'failed') : ''}` : '';
    const ls = m.lettersState && m.lettersState.state && m.lettersState.state !== 'none' ? `letters: ${h(m.lettersState.text || m.lettersState.state)}${m.lettersState.why ? ' — ' + h(m.lettersState.why) : ''}` : '';
    const names = (k) => h((Array.isArray(c[k]) ? c[k] : []).join('\n'));
    const idsTxt = (k) => h((Array.isArray(c[k]) ? c[k] : []).join(', '));
    return `<details class="stg-char" data-stgchar="${h(m.name)}" ${SP.openChars.has(m.name) ? 'open' : ''}><summary>
        <span class="who"><span class="dot ${m.online ? 'on' : ''}" title="${m.online ? 'online' : 'offline'}"></span><b>${h(m.name)}</b>${m.level ? `<span class="lv">${m.level}</span>` : ''}${m.town ? `<span class="lv">· ${h(m.town)}</span>` : ''}<span class="lv">· ${m.clan ? (/^\(clan/.test(m.clan) ? 'in clan' : 'clan ' + h(m.clan)) : 'no clan'}</span>${m.bag != null ? `<span class="lv ${m.bag >= 180 ? 'stg-full' : ''}">· bag ${m.bag} kinds</span>` : ''}${m.letters ? `<span class="lv">· ${m.letters} letters</span>` : ''}</span>
        <span class="stg-sum">${effLine(e, !!m.clan)}</span></summary>
      <div class="stg-body">
        ${levelEditor('chars|' + m.name, c, inh)}
        <details class="fnd-more"><summary>Item rules (${['keepNames', 'depositNames', 'keep', 'deposit'].reduce((a, k) => a + (Array.isArray(c[k]) ? c[k].length : 0), 0)})</summary>
          <div class="fnd-grid sm stg-rules">
            <label class="fnd-f"><span class="fl">Always keep (names, one per line)</span><textarea rows="3" data-stglist="chars|${h(m.name)}|keepNames" aria-label="${h(m.name)} keep names">${names('keepNames')}</textarea><span class="fh">part of the item name; regular expressions work (Arrow$)</span></label>
            <label class="fnd-f"><span class="fl">Always store (names)</span><textarea rows="3" data-stglist="chars|${h(m.name)}|depositNames" aria-label="${h(m.name)} store names">${names('depositNames')}</textarea><span class="fh">.* = everything not kept above</span></label>
            <label class="fnd-f"><span class="fl">Always keep (item ids)</span><input type="text" data-stgids="chars|${h(m.name)}|keep" value="${idsTxt('keep')}" placeholder="e.g. 1661, 736" aria-label="${h(m.name)} keep ids"></label>
            <label class="fnd-f"><span class="fl">Always store (item ids)</span><input type="text" data-stgids="chars|${h(m.name)}|deposit" value="${idsTxt('deposit')}" placeholder="e.g. 1865" aria-label="${h(m.name)} store ids"></label>
          </div></details>
        <div class="stg-btns">
          <button type="button" data-stgact="plan" data-n="${h(m.name)}">Plan (dry run)</button>
          ${m.plan ? `<button type="button" data-stgact="show" data-n="${h(m.name)}">Last plan: ${m.plan.n} kinds</button>` : ''}
          <button type="button" data-stgact="store" data-n="${h(m.name)}" class="go">Store now</button>
          <button type="button" data-stgact="letters" data-n="${h(m.name)}">Letters now</button>
          <button type="button" data-stgact="preset" data-n="${h(m.name)}">Preset: everything → clan</button>
          <button type="button" data-stgact="clear" data-n="${h(m.name)}" ${Object.keys(c).filter(k => !k.startsWith('_')).length ? '' : 'disabled'}>Use party / default</button>
        </div>
        ${wh || ls ? `<div class="fnd-hint">${[wh, ls].filter(Boolean).join(' · ')}</div>` : ''}
      </div></details>`;
  }
  function renderParties() {
    const el = $id('stgParties'); if (!el) return;
    const R = SP.cur, P = (SP.info && SP.info.parties) || [];
    el.innerHTML = P.map(p => {
      const lv = obj(obj(R.parties)[p.leader]), inh = eff(Object.assign({}, R, { parties: {} }), '', p.leader);
      const autoN = p.members.filter(m => eff(R, m.name, p.leader).auto).length;
      return `<div class="fnd-party stg-party"><div class="ph"><b>Party ${h(p.leader)}</b><span class="muted">${p.members.length} char${p.members.length === 1 ? '' : 's'} · ${autoN ? autoN + ' store automatically' : 'nobody stores automatically'}</span></div>
        ${levelEditor('parties|' + p.leader, lv, inh)}
        <details class="fnd-mems" data-stgparty="${h(p.leader)}" ${SP.openParties.has(p.leader) ? 'open' : ''}><summary>Characters (${p.members.length})</summary>${p.members.map(m => charRow(m, p.leader)).join('')}</details></div>`;
    }).join('') || '<div class="muted">No parties in swarm.config.json.</div>';
  }
  function renderBar() {
    const el = $id('stgBar'); if (!el) return;
    const dt = dirty(), ne = Object.keys(SP.err).length;
    el.innerHTML = `<div class="sum">${!SP.cur ? 'Loading…' : ne ? `<span class="bad">${ne} field${ne === 1 ? '' : 's'} not valid</span>` : dt ? '<b>Unsaved changes</b>' : 'Saved' + (SP.cur && SP.cur._updated ? ` <span class="muted">· ${h(String(SP.cur._updated).slice(0, 16).replace('T', ' '))} UTC</span>` : '')}</div>
      <div class="btns"><button data-stgbar="undo" ${dt ? '' : 'disabled'}>Undo changes</button><button data-stgbar="save" class="go" ${dt && !SP.busy && !ne ? '' : 'disabled'}>${SP.busy ? 'Saving…' : 'Save'}</button></div>`;
  }

  // ============================================================================================ edits
  function setPath(pathStr, v) {
    const ks = pathStr.split('|'); let o = SP.cur; const chain = [o];
    for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object' || Array.isArray(o[ks[i]])) o[ks[i]] = {}; o = o[ks[i]]; chain.push(o); }
    const last = ks[ks.length - 1];
    if (v === null || v === undefined || (Array.isArray(v) && !v.length)) delete o[last]; else o[last] = v;
    for (let i = ks.length - 2; i >= 1; i--) { const parent = chain[i], k = ks[i]; if (parent[k] && typeof parent[k] === 'object' && !Array.isArray(parent[k]) && !Object.keys(parent[k]).length && ks[0] !== 'defaults') delete parent[k]; }   // an empty trigger / party / character = inherit
    if (ks[0] === 'defaults' && SP.cur.defaults && SP.cur.defaults.trigger && !Object.keys(SP.cur.defaults.trigger).length) delete SP.cur.defaults.trigger;
  }
  function onChange(e) {
    const t = e.target; if (!t || !t.dataset) return;
    if (t.dataset.stg) {
      const p = t.dataset.stg; let v = t.value;
      if (/\|auto$/.test(p)) v = v === 'on' ? true : v === 'off' ? false : null;
      else if (t.dataset.num) {
        const [lo, hi] = t.dataset.num.split(',').map(Number), n = Number(v);
        if (v === '') { delete SP.err[p]; v = null; }
        else if (!isFinite(n) || n < lo || n > hi) { SP.err[p] = `${lo} to ${hi}`; t.classList.add('bad'); renderBar(); return; }
        else { delete SP.err[p]; v = Math.round(n); }
        t.classList.remove('bad');
      } else if (v === '') v = null;
      setPath(p, v); softRender(); return;
    }
    if (t.dataset.stglist) { const v = t.value.split(/\r?\n|,(?![^\[]*\])/).map(x => x.trim()).filter(Boolean); const bad = v.filter(x => { try { new RegExp(x, 'i'); return false; } catch (er) { return true; } });
      if (bad.length) { SP.err[t.dataset.stglist] = 'not a valid pattern: ' + bad.join(', '); t.classList.add('fnd-amt', 'bad'); renderBar(); return; }
      delete SP.err[t.dataset.stglist]; t.classList.remove('bad'); setPath(t.dataset.stglist, v); renderBar(); return; }
    if (t.dataset.stgids) { const raw = t.value.split(/[\s,;]+/).filter(Boolean), v = raw.map(Number);
      if (v.some(n => !Number.isInteger(n) || n <= 0)) { SP.err[t.dataset.stgids] = 'item ids are whole numbers'; t.classList.add('fnd-amt', 'bad'); renderBar(); return; }
      delete SP.err[t.dataset.stgids]; t.classList.remove('bad'); setPath(t.dataset.stgids, [...new Set(v)]); renderBar(); return; }
    if (t.dataset.stglet) {
      const k = t.dataset.stglet; SP.cur.letters = obj(SP.cur.letters);
      if (k === 'on') SP.cur.letters.on = !!t.checked;
      else if (k === 'to') SP.cur.letters.to = t.value;
      else if (k === 'keep') SP.cur.letters.keep = t.value === '1';
      else if (k === 'gapMin') { const n = Number(t.value); if (t.value === '') delete SP.cur.letters.gapMin; else if (!isFinite(n) || n < 0 || n > 1440) { SP.err.letgap = '0 to 1440'; renderBar(); return; } else { delete SP.err.letgap; SP.cur.letters.gapMin = Math.round(n); } }
      renderLetters(); renderBar(); return;
    }
  }
  function softRender() { setTimeout(() => { if (!SP.open) return; const y = window.scrollY; render(); window.scrollTo(0, y); }, 0); }
  async function onClick(e) {
    const it = e.target.closest('[data-stgitem]');
    if (it) { const L = SP.cur.letters = obj(SP.cur.letters), all = ((SP.info && SP.info.letterItems) || []).map(i => i.id); let ids = Array.isArray(L.ids) && L.ids.length ? L.ids.map(Number) : all.slice(); const id = Number(it.dataset.stgitem);
      ids = ids.includes(id) ? ids.filter(x => x !== id) : ids.concat(id); if (!ids.length) { flash('At least one item must stay ticked (switch the hand-over off instead).', true); return; } L.ids = ids; renderLetters(); renderBar(); return; }
    const ex = e.target.closest('[data-stgex]');
    if (ex) { const L = SP.cur.letters = obj(SP.cur.letters), n = ex.dataset.stgex; let a = Array.isArray(L.except) ? L.except.slice() : []; a = a.includes(n) ? a.filter(x => x !== n) : a.concat(n); L.except = a; renderLetters(); renderBar(); return; }
    const bb = e.target.closest('button[data-stgbar]');
    if (bb) {
      if (bb.dataset.stgbar === 'undo') { if (!(await uiConfirm({ title: 'Undo changes?', body: 'Throw away every change on this page since the last save.', confirmText: 'Undo changes', cancelText: 'Keep editing' }))) return; SP.cur = clone(SP.orig); SP.err = {}; render(); flash('Changes undone.'); return; }
      if (bb.dataset.stgbar === 'save') return save();
    }
    const b = e.target.closest('button[data-stgact]'); if (!b) return;
    const n = b.dataset.n, act = b.dataset.stgact;
    if (act === 'preset') {
      if (!(await uiConfirm({ title: `${n}: everything to the clan warehouse?`, body: [uiP(uiEm(n), ' will store everything except its consumables in the clan warehouse:'), uiList(['Warehouse: clan (its own warehouse while it is not in a clan)', 'What: everything except shots, scrolls of escape / resurrection, potions, arrows / bolts, spirit ore, elixirs, herbs, recovery scrolls', 'Worn items, quest items and adena always stay']),
        uiNote('Automatic stays as it is. Only the clan leader can take items out of the clan warehouse. Save afterwards.')], confirmText: 'Apply preset', cancelText: 'Cancel' }))) return;
      const c = SP.cur.chars = obj(SP.cur.chars); const old = obj(c[n]); c[n] = Object.assign({}, old, { dest: 'clan', mode: 'all', keepNames: [...new Set((Array.isArray(old.keepNames) ? old.keepNames : []).concat(KEEP_CONSUMABLES))] });
      SP.openChars.add(n); render(); flash(`${n}: preset applied — press Save.`); return;
    }
    if (act === 'clear') {
      if (!(await uiConfirm({ title: `${n}: use the party / default settings?`, body: [uiP('Removes ', uiEm(n), '’s own warehouse, mode, automatic, trigger and town settings. Its item rules (keep / store lists) stay.')], confirmText: 'Remove own settings', cancelText: 'Cancel' }))) return;
      const c = obj(obj(SP.cur.chars)[n]); ['dest', 'mode', 'auto', 'trigger', 'town'].forEach(k => delete c[k]); if (!Object.keys(c).length && SP.cur.chars) delete SP.cur.chars[n]; render(); return;
    }
    if (act === 'show') return showPlan(n);
    if (dirty() && act !== 'letters') { const go = await uiConfirm({ title: 'Unsaved changes', body: [uiWarn('The bots use the SAVED settings. Your changes on this page are not saved yet.'), uiP('Send the order anyway (with the saved settings)?')], confirmText: 'Send anyway', cancelText: 'Cancel' }); if (!go) return; }
    if (act === 'plan') {
      const t0 = Date.now();
      if (!(await send(`!stashplan ${n}`, n))) return;
      flash(`${n}: dry run ordered — waiting for the plan…`);
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        let d = null; try { d = await api('/api/storage/plan?name=' + encodeURIComponent(n)); } catch (er) { }
        if (d && d.ok && Date.parse(d.at) >= t0 - 5000) { showPlanData(d); load(true); return; }
      }
      flash(`${n} did not answer within a minute (offline, busy or its script is not ready). The plan appears under "Last plan" once it is written.`, true); return;
    }
    const m = (((SP.info && SP.info.parties) || []).flatMap(p => p.members)).find(x => x.name === n) || {}, e2 = eff(SP.orig, n, partyOf(n));
    if (act === 'store') {
      const where = e2.dest === 'private' || !m.clan ? 'its OWN (private) warehouse' : 'the CLAN warehouse (only the clan leader can take items out)';
      if (e2.mode === 'off') { await uiAlert({ title: `${n} stores nothing`, body: 'Its "What to store" is Off. Change it (and save) first.' }); return; }
      if (!(await uiConfirm({ title: `${n}: store now?`, body: [uiP(uiEm(n), ` walks to the warehouse keeper and puts ${e2.mode === 'all' ? 'everything except its consumables' : 'what its rules say'} into `, uiEm(where), '.'), uiNote('A leader / solo character outside Giran goes to Giran first (.giran); a member must already be in Giran. Fee: 30 adena per item. Press "Plan" first to see the list.')], confirmText: 'Store now', cancelText: 'Cancel' }))) return;
      if (await send(`!stash ${n}`, n)) flash(`${n}: !stash sent — see "What they do" / Logs/stash.log.`); return;
    }
    if (act === 'letters') {
      const L = obj(SP.orig.letters), CL = (SP.info && SP.info.clanLeader) || '', to = !L.to || L.to === 'clanleader' ? CL : L.to;
      if (!(await uiConfirm({ title: `${n}: hand the letters over now?`, body: [uiP(uiEm(n), ' hands its event letters to ', uiEm(to || '?'), ' now (also when the automatic hand-over is off).'), uiNote('Only when both are idle in the same town — nobody travels for it.')], confirmText: 'Hand over', cancelText: 'Cancel' }))) return;
      if (await send(`!letters ${n}`, n)) flash(`${n}: !letters sent.`);
    }
  }
  const partyOf = (n) => { const p = ((SP.info && SP.info.parties) || []).find(x => x.members.some(m => m.name === n)); return p ? p.leader : ''; };
  async function send(cmd, name) {
    try {
      const d = await api('/api/command', { method: 'POST', body: JSON.stringify({ cmd, targets: ['char:' + name] }) });
      if (!d || d.error) { await uiError(`${cmd}: ${(d && d.error) || 'no answer'}`); return false; }
      return true;
    } catch (e) { await uiError(`${cmd}: ${e.message}`); return false; }
  }
  async function showPlan(n) {
    let d = null; try { d = await api('/api/storage/plan?name=' + encodeURIComponent(n)); } catch (e) { }
    if (!d || !d.ok) { await uiAlert({ title: 'No plan', body: (d && d.error) || 'no answer' }); return; }
    showPlanData(d);
  }
  function showPlanData(d) {
    const line = (r) => `${r.name}${r.count > 1 ? ' ×' + r.count : ''} — ${r.why}`;
    const s = d.settings || {};
    uiAlert({ title: `${d.name}: warehouse plan (dry run)`, body: [
      uiKV([['When', String(d.at || '').slice(0, 19).replace('T', ' ') + ' UTC'], ['Bag', `${d.bag} kinds`], ['Warehouse', d.dest === 'clan' ? 'clan' : 'own (private)'], ['What', s.mode === 'all' ? 'everything except consumables' : s.mode === 'off' ? 'off' : 'smart rules'], ['Summary', d.summary || '']]),
      uiH(`Would store (${d.deposit.length})`), uiList(d.deposit.slice(0, 60).map(line).concat(d.deposit.length > 60 ? [`… and ${d.deposit.length - 60} more`] : [])),
      uiH(`Keeps (${d.keep.length})`), uiList(d.keep.slice(0, 60).map(line).concat(d.keep.length > 60 ? [`… and ${d.keep.length - 60} more`] : [])),
      d.sell.length ? uiNote(`${d.sell.length} kinds are left for the sale step.`) : '' ].filter(Boolean) });
  }
  function changes() {
    const out = [], f = (v) => JSON.stringify(v === undefined ? null : v);
    const a = SP.orig, b = SP.cur;
    if (f(a.defaults) !== f(b.defaults)) out.push(`Defaults: ${f(b.defaults)}`);
    if (f(a.letters) !== f(b.letters)) { const L = obj(b.letters); out.push(`Letters: ${L.on ? 'ON' : 'off'}, receiver ${L.to || 'clanleader'}${L.keep ? ', receiver keeps them' : ''}${(L.except || []).length ? ', never: ' + L.except.join(', ') : ''}`); }
    ['parties', 'chars'].forEach(sec => new Set(Object.keys(obj(a[sec])).concat(Object.keys(obj(b[sec])))).forEach(k => { if (f(obj(a[sec])[k]) !== f(obj(b[sec])[k])) out.push(`${sec === 'chars' ? k : 'Party ' + k}: ${obj(b[sec])[k] ? f(obj(b[sec])[k]).slice(0, 200) : 'party / default settings'}`); }));
    return out;
  }
  async function save() {
    if (SP.busy || !SP.cur) return;
    if (Object.keys(SP.err).length) { await uiAlert({ title: 'Some fields are not valid', kind: 'error', body: [uiList(Object.keys(SP.err).map(p => `${p.replace(/\|/g, ' › ')}: ${SP.err[p]}`))] }); return; }
    const ch = changes(); if (!ch.length) { flash('Nothing changed.'); return; }
    if (!(await uiConfirm({ title: 'Save the storage settings?', body: [uiP(`${ch.length} change${ch.length === 1 ? '' : 's'}:`), uiList(ch.slice(0, 30)), uiP('Every bot uses them at its next check (no restart).')], confirmText: 'Save', cancelText: 'Cancel' }))) return;
    SP.busy = true; renderBar();
    let d = null;
    try { d = await api('/api/storage', { method: 'POST', body: JSON.stringify({ rules: SP.cur, rev: SP.rev }) }); } catch (e) { d = { error: e.message }; }
    SP.busy = false;
    if (d && d.conflict) {
      if (await uiConfirm({ title: 'Changed meanwhile', body: [uiWarn('Someone else saved the storage settings after this page loaded them.'), uiP('Overwrite them with your version?')], confirmText: 'Overwrite', cancelText: 'Cancel', danger: true })) { SP.rev = d.rev; return save(); }
      renderBar(); return;
    }
    if (!d || d.error || !d.ok) { renderBar(); await uiError((d && d.error) || 'no answer from the dashboard server', 'Not saved'); return; }
    SP.rev = d.rev; SP.orig = clone(d.rules); SP.cur = clone(SP.orig); SP.err = {};
    flash(`Saved (${ch.length} change${ch.length === 1 ? '' : 's'}).`); render(); load(true);
  }

  window.StoragePage = { route, open, close, eff, _state: SP };
})();
