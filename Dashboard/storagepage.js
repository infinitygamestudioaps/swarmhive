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
    api('/api/whauto').then(x => { SP.wa = x && !x.error ? x : null; renderCwhAuto(); renderCwhList(); }).catch(() => { SP.wa = null; renderCwhAuto(); });   // WHAUTO-2026-10-16
    api('/api/lootrules').then(x => { SP.loot = x && !x.error ? x : null; renderLoot(); }).catch(() => { SP.loot = null; renderLoot(); });   // LOOT RULES 2026-10-13: the per-party loot line
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
      <div class="box"><h3>Collector</h3><div id="stgColl"></div></div>
      <div class="box"><h3>Never store</h3><div id="stgNever"></div></div>
      <div class="box" id="stgCwhBox"><h3>Clan warehouse</h3><div id="stgCwh"></div></div>
      <div class="box" id="stgCraftBox"><h3>Our crafter</h3><div id="stgCraft"></div></div><!-- CRAFTER-2026-10-15: filled by Dashboard/crafterpanel.js -->
      <div class="box"><h3>Event letters</h3><div id="stgLet"></div></div>
      <div class="box"><h3>Loot from hunting</h3><div id="stgLoot"></div></div>
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
    s.addEventListener('change', (e) => { const w = e.target && e.target.closest && e.target.closest('[data-wa]'); if (w) waField(w); });   // WHAUTO-2026-10-16
    s.addEventListener('input', (e) => { const t = e.target; if (t && t.dataset && t.dataset.cwhq !== undefined) { SP.cwhQ = t.value; renderCwhList(); } });
    s.addEventListener('toggle', (e) => { const d = e.target; if (!d || !d.dataset) return; const set = d.dataset.stgparty ? SP.openParties : d.dataset.stgchar ? SP.openChars : null; if (!set) return; const k = d.dataset.stgparty || d.dataset.stgchar; if (d.open) set.add(k); else set.delete(k); }, true);
    return s;
  }
  function route(kind, arg) {
    if (kind !== 'storage') { close(); return false; }
    open();
    if (arg === 'clanwh') { const go = (n) => { const e = $id('stgCwh'); if (e && e.querySelector('[data-cwhlist]')) { e.closest('.box').scrollIntoView({ block: 'start' }); return; } if (n > 0) setTimeout(() => go(n - 1), 300); }; go(20); }   // CLANWH-LINK: #/storage/clanwh
    return true;
  }
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
    renderDef(); renderColl(); renderNever(); renderCwh(); renderLetters(); renderLoot(); renderParties(); renderBar();
  }
  // ---- COLLECTOR 2026-10-14 (owner: "tell him to stand in Giran, teams deliver all their loot to him, he puts it into the clan warehouse and sells")
  function renderColl() {
    const el = $id('stgColl'); if (!el) return;
    const C = obj(SP.cur.collector), on = C.on === true, CL = (SP.info && SP.info.clanLeader) || '', who = C.name || CL;
    const all = []; ((SP.info && SP.info.parties) || []).forEach(p => p.members.forEach(m => all.push(m.name)));
    const towns = (SP.info && SP.info.towns) || ['Giran'];
    el.innerHTML = `<label class="fnd-sw"><input type="checkbox" data-stgcoll="on" ${on ? 'checked' : ''}><span class="tr" aria-hidden="true"></span><span class="lb ${on ? 'on' : 'off'}">${on ? `On — ${h(who || '?')} stays in ${h(C.town || 'Giran')} as the collector` : 'Off — nothing happens until you switch it on'}</span></label>
      <div class="fnd-grid sm">
        <label class="fnd-f"><span class="fl">Who</span><select data-stgcoll="name" aria-label="collector"><option value="" ${!C.name ? 'selected' : ''}>The clan leader${CL ? ' (' + h(CL) + ')' : ''}</option>${all.map(n => `<option value="${h(n)}" ${C.name === n ? 'selected' : ''}>${h(n)}</option>`).join('')}</select></label>
        <label class="fnd-f"><span class="fl">Stays in</span><select data-stgcoll="town" aria-label="collector town">${towns.map(t => `<option value="${h(t)}" ${(C.town || 'Giran') === t ? 'selected' : ''}>${h(t)}</option>`).join('')}</select></label>
      </div>
      <div class="fnd-hint">While on, ${h(who || 'the collector')} never hunts or travels (no leveling, plans, raids, quests), goes back to ${h(C.town || 'Giran')} after every order and waits at the start. By itself it still: <b>receives</b> the teams' loot (⚙ Settings → Loot: to the clan leader), <b>stores</b> it (its storage settings below: automatic + trigger), <b>sells</b> marked and "never store — sold instead" items, looks at the clan warehouse and hands adena to the teams in town. Your orders (Take out and sell, Store now …) always work. Press Save.</div>`;
  }
  // ---- WHSELL 2026-10-14 (owner: "select clan warehouse and select what should be taken out and sold, like common items should never be stored")
  /** Never store: Common items / own names; sell them instead (stash_rules.json neverStore, = swarm.js stashNever) */
  function renderNever() {
    const el = $id('stgNever'); if (!el) return;
    const N = obj(SP.cur.neverStore), names = (Array.isArray(N.names) ? N.names : []).join('\n');
    el.innerHTML = `<div class="fnd-hint">These items never go into any warehouse — not by the automatic storing, not by "Store now", not by the supply run. This beats every other storage rule. Worn items are never touched.</div>
      <label class="fnd-sw"><input type="checkbox" data-stgnv="common" ${N.common ? 'checked' : ''}><span class="tr" aria-hidden="true"></span><span class="lb ${N.common ? 'on' : 'off'}">${N.common ? 'Common items are never stored' : 'Common items may be stored (switch on to keep them out)'}</span></label>
      <div class="fnd-hint">Common items = everything named “Common Item - …” (same stats as the real item, about 1/20 of the price, no set bonus, cannot be enchanted).</div>
      <label class="fnd-f"><span class="fl">Also never store (names, one per line)</span><textarea rows="3" data-stgnvnames="1" aria-label="never store names" placeholder="e.g. Tutorial Guide">${h(names)}</textarea><span class="fh">part of the item name; ^ = starts with</span></label>
      <label class="fnd-sw"><input type="checkbox" data-stgnv="sell" ${N.sell ? 'checked' : ''}><span class="tr" aria-hidden="true"></span><span class="lb ${N.sell ? 'on' : 'off'}">${N.sell ? 'Sold instead — at the next town sale / supply run / !sell' : 'Kept in the bag (switch on to sell them instead)'}</span></label>
      <div class="fnd-hint">Selling still needs the party's “Sell junk on town visits” (⚙ Settings → Supplies) for the automatic town sale; your !sell order always works. Press Save at the bottom.</div>`;
  }
  const cwhKey = (r) => r.id + '+' + (r.enchant || 0);

  // ===== WHAUTO-2026-10-16 (owner: "select which should be crystallized and which should be sold by default ... then the collector will run around and
  // sell and take out items for dwarfs to disenchant"): a default per clan warehouse kind (Dashboard/whauto_api.js, Scripts/data/wh_auto.json)
  const WA_GEAR = ['weapon', 'armor', 'accessory'];
  function waTag(r) {
    const d = SP.wa && SP.wa.data, a = d && !(r.enchant > 0) && d.items && d.items[r.id];
    return a ? `<span class="tag ${a.act === 'cry' ? 'warn' : 'good'}" title="default: ${a.act === 'cry' ? 'taken out and crystallized by the crafter' : 'taken out and sold'}">${a.act === 'cry' ? 'crystallize' : 'sell'}</span>` : '';
  }
  function renderCwhAuto() {
    const el = document.querySelector('#stgCwh [data-cwhauto]'); if (!el) return;
    const W = SP.wa;
    if (!W) { el.innerHTML = '<div class="muted">Defaults (always sell / always crystallize) need a dashboard server restart.</div>'; return; }
    const d = W.data || { items: {} }, L = Object.values(d.items || {}), ns = L.filter(x => x.act === 'sell').length, nc = L.length - ns, st = W.status || {};
    const last = st.last ? `${st.last.ok ? 'Last order' : 'Last order FAILED'} (${String(st.last.at || '').slice(11, 16)} UTC): ${st.last.msg}` : 'No order sent yet.';
    el.innerHTML = `<div class="stg-wa">
      <div><b>Defaults</b>: ${ns} kind${ns === 1 ? '' : 's'} always sold, ${nc} always crystallized. Tick items below and press <i>Always sell</i> or <i>Always crystallize</i>.</div>
      <label class="fnd-sw"><input type="checkbox" data-wa="on" ${d.on ? 'checked' : ''}><span class="tr" aria-hidden="true"></span><span class="lb ${d.on ? 'on' : 'off'}">${d.on ? 'On: the collector does it by itself while idle in Giran (one order at a time, enchanted pieces never)' : 'Off: nothing happens by itself'}</span></label>
      <div class="stg-warow"><label>Crafter <select data-wa="crafter" aria-label="crafter"><option value="">the first one known</option>${(W.crafters || []).map(c => `<option value="${h(c)}" ${d.crafter === c ? 'selected' : ''}>${h(c)}</option>`).join('')}</select></label>
        <label>every <input type="number" min="10" max="1440" step="5" data-wa="everyMin" value="${h(String(d.everyMin || 30))}" aria-label="minutes between orders"> min</label>
        <button type="button" data-waact="run">Run now</button></div>
      ${st.check ? `<div class="muted">Now: ${h(st.check.why)}</div>` : ''}<div class="muted">${h(last)}</div></div>`;
  }
  async function waPost(b) {
    let r = null; try { r = await api('/api/whauto', { method: 'POST', body: JSON.stringify(b) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { flash((r && r.error) || 'not saved (the dashboard server may need a restart)', true); return null; }
    return r;
  }
  async function waRefresh() { try { const x = await api('/api/whauto'); SP.wa = x && !x.error ? x : SP.wa; } catch (e) { } renderCwhAuto(); renderCwhList(); }
  async function waSetDefault(act) {
    const all = (SP.info && SP.info.clanWh && SP.info.clanWh.items) || [], sel = SP.cwhSel || new Set();
    let chosen = all.filter(r => sel.has(cwhKey(r))); if (!chosen.length) return;
    const ench = chosen.filter(r => r.enchant > 0); chosen = chosen.filter(r => !(r.enchant > 0));
    if (act === 'cry') {
      const bad = chosen.filter(r => !WA_GEAR.includes(r.cat) || !r.grade || r.grade === 'NONE');
      if (bad.length) { await uiError('Only D-grade or better weapons, armor and jewelry can be crystallized. Not possible: ' + bad.slice(0, 8).map(r => r.name).join(', ') + (bad.length > 8 ? ' ...' : ''), 'Cannot crystallize'); return; }
    }
    if (!chosen.length) { await uiError('Enchanted pieces never get a default (they are never sold or crystallized by themselves).', 'Nothing set'); return; }
    if (act === 'cry' && !(await uiConfirm({ title: 'Always crystallize ' + chosen.length + ' kind' + (chosen.length === 1 ? '' : 's') + '?', danger: true,
      body: [uiP('With the switch on, the collector takes these out of the clan warehouse and the crafter turns them into crystals. Crystallized items are gone.'), uiList(chosen.slice(0, 30).map(r => r.name))],
      confirmText: 'Always crystallize', cancelText: 'Cancel' }))) return;
    const r = await waPost({ set: chosen.map(x => ({ id: x.id, act, name: x.name })) }); if (!r) return;
    SP.wa = Object.assign({}, SP.wa, { data: r.data });
    flash(chosen.length + ' kind' + (chosen.length === 1 ? '' : 's') + (act === 'sell' ? ': always sold' : act === 'cry' ? ': always crystallized' : ': no default') + (ench.length ? ' (' + ench.length + ' enchanted skipped)' : '') + '.');
    SP.cwhSel = new Set(); renderCwhAuto(); renderCwhList();
  }
  async function waField(w) {
    const k = w.dataset.wa, b = {};
    if (k === 'on') {
      b.on = !!w.checked;
      if (b.on) {
        const d = (SP.wa && SP.wa.data) || { items: {} };
        if (!(await uiConfirm({ title: 'Let the collector do it by itself?', body: [uiP('While idle in Giran, the clan leader takes the kinds marked "sell" out of the clan warehouse and sells them, and the ones marked "crystallize" out for the crafter, who crystallizes them. One order at a time, every ' + (d.everyMin || 30) + ' minutes at most. Enchanted pieces are never touched.')], confirmText: 'Switch on', cancelText: 'Cancel' }))) { w.checked = false; return; }
      }
    } else if (k === 'crafter') b.crafter = w.value;
    else b.everyMin = Number(w.value);
    const r = await waPost(b); if (r) SP.wa = Object.assign({}, SP.wa, { data: r.data });
    renderCwhAuto();
  }
  async function waRun() {
    const r = await waPost({ runNow: true }); if (!r) return;
    flash(r.msg || ('Nothing sent: ' + (r.why || r.error || '?')), !r.msg);
    waRefresh();
  }
  // CWHGROUPS 2026-10-14: groups + grade filter; the list is grouped (a heading per group) in this order
  const CWH_CATS = [['weapon', 'Weapons'], ['armor', 'Armor'], ['accessory', 'Accessories'], ['material', 'Materials'], ['part', 'Crafting parts'], ['recipe', 'Recipes'], ['scroll', 'Scrolls'], ['letter', 'Event letters'], ['use', 'Potions & consumables'], ['stone', 'Life stones & seal stones'], ['other', 'Other']];
  const CWH_SELLALL = ['part', 'recipe'];   // owner 2026-10-14: one button sells a whole group
  const CWH_GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
  function cwhRows() {
    const W = SP.info && SP.info.clanWh, q = String(SP.cwhQ || '').trim().toLowerCase();
    const rows = W ? W.items : [];
    return rows.filter(r => (!SP.cwhCommon || r.common) && (!q || r.name.toLowerCase().includes(q)) && (!SP.cwhCat || r.cat === SP.cwhCat) && (!SP.cwhGrade || r.grade === SP.cwhGrade));
  }
  function renderCwh() {
    const el = $id('stgCwh'); if (!el) return;
    const W = SP.info && SP.info.clanWh, CL = (SP.info && SP.info.clanLeader) || 'the clan leader';
    SP.cwhSel = SP.cwhSel || new Set();
    if (!W) { el.innerHTML = `<div class="muted">The clan warehouse list is not known yet. It appears once ${h(CL)} opens the clan warehouse (he looks after every deposit).</div>`; return; }
    if (el.querySelector('[data-cwhlist]')) { renderCwhList(); return; }   // keep the filter box (and the phone keyboard) as it is
    el.innerHTML = `<div class="fnd-hint">As ${h(W.seenBy || CL)} last saw it: ${h(String(W.seenAt || '').slice(0, 16).replace('T', ' '))} UTC · ${W.items.length} kinds. Only the clan leader (${h(CL)}) can take items out (L2Toggle).</div>
      <div class="stg-cwhtools"><input type="search" data-cwhq="" value="${h(SP.cwhQ || '')}" placeholder="Search a name…" aria-label="search the clan warehouse">
        <button type="button" class="trd-chip fnd-chip ${SP.cwhCommon ? 'on' : ''}" data-cwhact="common" aria-pressed="${!!SP.cwhCommon}">Only Common items</button>
        <button type="button" data-cwhact="all">Tick all shown</button><button type="button" data-cwhact="none">Untick all</button>
        <select data-cwhgrade="1" aria-label="grade"><option value="">Every grade</option>${CWH_GRADES.map(g => `<option value="${g}" ${SP.cwhGrade === g ? 'selected' : ''}>${g === 'NONE' ? 'No grade' : g + '-grade'}</option>`).join('')}</select></div>
      <div class="stg-cwhauto" data-cwhauto="1"></div>
      <div class="stg-cwhcats" data-cwhcats="1"></div>
      <div class="stg-cwhlist" data-cwhlist="1"></div>
      <div class="stg-btns stg-cwhbtns"></div>`;
    renderCwhList();
  }
  function renderCwhList() {
    const el = $id('stgCwh'); if (!el) return;
    const L = el.querySelector('[data-cwhlist]'), B = el.querySelector('.stg-cwhbtns'); if (!L) return;
    { const wa = el.querySelector('[data-cwhauto]'); if (wa && !wa.innerHTML) renderCwhAuto(); }   // WHAUTO-2026-10-16: a rebuilt section gets its defaults box
    const rows = cwhRows(), sel = SP.cwhSel || new Set(), all = (SP.info && SP.info.clanWh && SP.info.clanWh.items) || [];
    [...sel].forEach(k => { if (!all.some(r => cwhKey(r) === k)) sel.delete(k); });   // gone from the warehouse meanwhile
    const cc = el.querySelector('[data-cwhcats]');
    if (cc) { const all = (SP.info && SP.info.clanWh && SP.info.clanWh.items) || [], cnt = {}; all.forEach(r => { cnt[r.cat] = (cnt[r.cat] || 0) + 1; });
      cc.innerHTML = `<button type="button" class="trd-chip fnd-chip ${!SP.cwhCat ? 'on' : ''}" data-cwhcat="">All <small>${all.length}</small></button>` + CWH_CATS.filter(([k]) => cnt[k]).map(([k, t]) => `<button type="button" class="trd-chip fnd-chip ${SP.cwhCat === k ? 'on' : ''}" data-cwhcat="${k}">${t} <small>${cnt[k]}</small></button>`).join(''); }
    const order = {}; CWH_CATS.forEach(([k], i) => { order[k] = i; });
    // SORT (owner 2026-10-14): by NAME in every group (numbers in order: Level 46 before Level 52); recipes by grade first;
    // life stones by level, then Life Stone < Mid < High < Top
    const nmKey = (r) => r.name.replace(/^\+\d+ /, ''), byName = (a, b) => nmKey(a).localeCompare(nmKey(b), undefined, { numeric: true, sensitivity: 'base' });
    const lsLvl = (r) => { const m = /Life Stone.*?Level\s*(\d+)/i.exec(r.name); return m ? Number(m[1]) : 999; }, lsQ = (r) => /^Top/i.test(r.name) ? 3 : /^High/i.test(r.name) ? 2 : /^Mid/i.test(r.name) ? 1 : 0;
    rows.sort((a, b) => (order[a.cat] ?? 99) - (order[b.cat] ?? 99)
      || (a.cat === 'recipe' ? Math.max(0, CWH_GRADES.indexOf(a.grade)) - Math.max(0, CWH_GRADES.indexOf(b.grade)) : 0)
      || (a.cat === 'stone' ? lsLvl(a) - lsLvl(b) || lsQ(a) - lsQ(b) : 0)
      || byName(a, b) || (a.enchant || 0) - (b.enchant || 0));
    let lastCat = null; const head = (r) => { if (r.cat === lastCat) return ''; lastCat = r.cat; const t = (CWH_CATS.find(([k]) => k === r.cat) || [0, 'Other'])[1]; return `<div class="stg-cwhgrp">${t}</div>`; };
    L.innerHTML = rows.length ? rows.map(r => head(r) + `<label class="stg-cwhrow ${sel.has(cwhKey(r)) ? 'on' : ''}"><input type="checkbox" data-cwh="${h(cwhKey(r))}" ${sel.has(cwhKey(r)) ? 'checked' : ''}>${r.icon ? `<img class="gi" src="${ico(r.icon)}" alt="">` : ''}<span class="nm">${h(r.name)}${r.grade && r.grade !== 'NONE' ? ` <span class="tag cwhgr">${r.grade}</span>` : ''}</span><span class="ct">${r.count > 1 ? '×' + r.count.toLocaleString() : ''}</span>${r.common ? '<span class="tag">Common</span>' : ''}${r.never ? '<span class="tag warn">never store</span>' : ''}${waTag(r)}</label>`).join('')
      : '<div class="muted">Nothing matches.</div>';
    const n = sel.size;
    if (B) B.innerHTML = `<span class="muted">${n ? n + ' kind' + (n === 1 ? '' : 's') + ' ticked' : 'Tick what should come out.'}</span>
      <button type="button" class="go" data-cwhact="sell" ${n ? '' : 'disabled'}>Take out and sell</button>
      <button type="button" data-cwhact="take" ${n ? '' : 'disabled'}>Take out (${h((SP.info && SP.info.clanLeader) || 'clan leader')} keeps them)</button>
      <button type="button" data-cwhact="give" ${n ? "" : "disabled"}>Take out and give to a crafter…</button>
      <button type="button" class="danger" data-cwhact="cry" ${n ? '' : 'disabled'}>Take out and crystallize…</button>
      <span class="stg-cwhdef">Default for the ticked: <button type="button" data-cwhact="defsell" ${n ? '' : 'disabled'}>Always sell</button><button type="button" data-cwhact="defcry" ${n ? '' : 'disabled'}>Always crystallize</button><button type="button" data-cwhact="defnone" ${n ? '' : 'disabled'}>No default</button></span>
      ${CWH_SELLALL.map(k => { const c = all.filter(r => r.cat === k).length, t = (CWH_CATS.find(([x]) => x === k) || [0, k])[1]; return c ? `<button type="button" class="go" data-cwhsellall="${k}">Sell all ${h(t)} (${c} kinds)</button>` : ''; }).join('')}
      ${SP.info && SP.info.clanWh && SP.info.clanWh.pending ? `<button type="button" data-cwhact="pending">Sell what is still in his bag (${SP.info.clanWh.pending} kinds)</button>` : ''}`;
  }
  // CRYQUEUE-2026-10-15 (owner: "under Storage select items I want crystallized"; never hard coded: the crafter is any Dwarf crafter the crafter page knows,
  // the clan leader is whoever leads the clan): the clan leader takes the ticked kinds out and trades them to the crafter, the crafter crystallizes them
  async function cwhPickCrafter(title, note) {   // CWHGIVE-2026-10-16: any crafter the crafter page knows (never hard coded)
    let ci = null; try { ci = await api("/api/crafter"); } catch (e) { ci = null; }
    const crafters = ((ci && ci.crafters) || []).filter(c => c && c.name);
    if (!crafters.length) { await uiError("No crafter found: this needs a Dwarf (Artisan / Warsmith / Maestro) in one of your parties.", "No crafter"); return null; }
    if (crafters.length === 1) return crafters[0].name;
    return await uiChoice({ title, body: note ? [uiP(note)] : [], buttons: crafters.map((c, i) => ({ label: c.name + (c.cand ? " (" + c.cand.cls + " " + c.cand.level + ")" : ""), value: c.name, primary: i === 0 })) });
  }
  // CWHGIVE-2026-10-16 (owner: "click a button from the clan warehouse and send items to the crafters"): the clan leader takes the ticked kinds
  // out and trades them to the chosen crafter (materials for crafting, gear to keep) - nothing is destroyed
  async function cwhGive() {
    const all = (SP.info && SP.info.clanWh && SP.info.clanWh.items) || [], sel = SP.cwhSel || new Set(), CL = (SP.info && SP.info.clanLeader) || "";
    const chosen = all.filter(r => sel.has(cwhKey(r))); if (!chosen.length) return;
    if (!CL) { await uiError("No clan leader is known - only the clan leader can take items out of the clan warehouse.", "Not possible"); return; }
    const crafter = await cwhPickCrafter("Which crafter gets them?", "The clan leader takes them out and hands them over in town."); if (!crafter) return;
    const byId = {}; chosen.forEach(r => { byId[r.id] = (byId[r.id] || 0) + r.count; });
    const list = chosen.slice(0, 40).map(r => r.name + (r.count > 1 ? " x" + r.count : "")).concat(chosen.length > 40 ? ["... and " + (chosen.length - 40) + " more"] : []);
    const body = [uiP(uiEm(CL), " takes these out of the clan warehouse and trades them to ", uiEm(crafter), ":"), uiList(list), uiNote(CL === crafter ? "He is the crafter himself: the items simply stay in his bag." : "Both must be in the same town; he stops what he is doing for this (a raid, Kamaloka or mission must end first). Nothing is crystallized or sold.")];
    if (!(await uiConfirm({ title: "Give " + chosen.length + " kind" + (chosen.length === 1 ? "" : "s") + " to " + crafter + "?", body, confirmText: "Give them", cancelText: "Cancel" }))) return;
    let d = null; try { d = await api("/api/crafter/cwh", { method: "POST", body: JSON.stringify({ crafter, items: Object.keys(byId).map(id => ({ id: Number(id), count: byId[id] })), confirm: true }) }); } catch (e) { d = { error: e.message }; }
    if (!d || !d.ok) { await uiError((d && d.error) || "no answer (the dashboard server may need a restart)", "Not sent"); return; }
    flash(CL + " takes " + chosen.length + " kind" + (chosen.length === 1 ? "" : "s") + " out for " + crafter + " - see \"What they do\"."); SP.cwhSel = new Set(); renderCwhList();
  }
  async function cwhCry() {
    const all = (SP.info && SP.info.clanWh && SP.info.clanWh.items) || [], sel = SP.cwhSel || new Set(), CL = (SP.info && SP.info.clanLeader) || '';
    const chosen = all.filter(r => sel.has(cwhKey(r))); if (!chosen.length) return;
    if (!CL) { await uiError('No clan leader is known - only the clan leader can take items out of the clan warehouse.', 'Not possible'); return; }
    let ci = null; try { ci = await api('/api/crafter'); } catch (e) { ci = null; }
    const crafters = ((ci && ci.crafters) || []).filter(c => c && c.name);
    if (!crafters.length) { await uiError('No crafter found: crystallizing needs a Dwarf (Artisan / Warsmith / Maestro) with the Crystallize skill in one of your parties.', 'No crafter'); return; }
    let crafter = crafters[0].name;
    if (crafters.length > 1) {
      crafter = await uiChoice({ title: 'Which crafter crystallizes them?', body: [uiP('The crafter needs the Crystallize skill for the grade (see the crafter card on this page).')],
        buttons: crafters.map((c, i) => ({ label: c.name + (c.cand ? ' (' + c.cand.cls + ' ' + c.cand.level + ')' : ''), value: c.name, primary: i === 0 })) });
      if (!crafter) return;
    }
    const byId = {}, names = {}; chosen.forEach(r => { byId[r.id] = (byId[r.id] || 0) + r.count; names[r.id] = String(r.name || '').replace(/^\+\d+ /, ''); });
    const ench = chosen.filter(r => Number(r.enchant) > 0);
    const list = chosen.slice(0, 40).map(r => r.name + (r.count > 1 ? ' x' + r.count : '')).concat(chosen.length > 40 ? ['... and ' + (chosen.length - 40) + ' more'] : []);
    const body = [uiP(uiEm(CL), ' takes these out of the clan warehouse and trades them to ', uiEm(crafter), ', who then CRYSTALLIZES them (the items are destroyed, crystals come out):'), uiList(list)];
    if (ench.length) body.push(uiWarn(ench.length + ' of them are enchanted - they are crystallized too.'));
    body.push(uiNote(crafter + ' crystallizes them once they are in its bag and it is not fighting / trading. Items above its Crystallize grade stay in its bag. The order ends after 2 days.'));
    if (!(await uiConfirm({ title: 'Take out and crystallize ' + chosen.length + ' kind' + (chosen.length === 1 ? '' : 's') + '?', body, danger: true, typeToConfirm: ench.length ? 'YES' : '', confirmText: 'Crystallize them', cancelText: 'Cancel' }))) return;
    let d = null; try { d = await api('/api/crafter/cwhcry', { method: 'POST', body: JSON.stringify({ crafter, items: Object.keys(byId).map(id => ({ id: Number(id), count: byId[id], name: names[id] })), enchanted: ench.length > 0, confirm: true }) }); } catch (e) { d = { error: e.message }; }
    if (!d || !d.ok) { await uiError((d && d.error) || 'no answer (the dashboard server may need a restart)', 'Not sent'); return; }
    flash(CL + ' takes ' + chosen.length + ' kind' + (chosen.length === 1 ? '' : 's') + ' out for ' + crafter + ', who crystallizes them - see "What they do".'); SP.cwhSel = new Set(); renderCwhList();
  }
  /** ALWAYS SELL (owner 2026-10-17: "Why can't I select items from the storage that should always be sold? It's annoying to keep clicking the same button
   *  every hour"): these exact names go on the never-store list (sold instead, swarm.js stashNever) + wh_auto marks them "sell" (automatic take-out-and-sell) */
  async function alwaysSell(chosen) {
    const kinds = {}; chosen.forEach(r => { kinds[r.id] = String(r.name || '').replace(/^\+\d+ /, ''); });
    const esc = (t) => '^' + t.replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m) + '$';
    try {
      const cur = await api('/api/storage'); const rules = JSON.parse(JSON.stringify((cur && cur.rules) || SP.orig || {}));
      const N = rules.neverStore = obj(rules.neverStore), names = Array.isArray(N.names) ? N.names : [];
      Object.values(kinds).forEach(n => { const p = esc(n); if (!names.includes(p)) names.push(p); });
      N.names = names; N.sell = true; N.common = N.common === true;
      const d = await api('/api/storage', { method: 'POST', body: JSON.stringify({ rules, rev: cur && cur.rev }) });
      if (!d || !d.ok) flash('Could not add them to the never-store list: ' + ((d && (d.error || (d.conflict && 'changed meanwhile'))) || 'no answer'), true);
    } catch (e) { flash('Never-store list: ' + e.message, true); }
    await waPost({ set: Object.keys(kinds).map(id => ({ id: Number(id), act: 'sell', name: kinds[id] })) });
    flash(Object.keys(kinds).length + ' kinds: always sold from now on');
    try { await load(true); } catch (e) { } waRefresh();
  }
  async function cwhRun(sell) {
    const all = (SP.info && SP.info.clanWh && SP.info.clanWh.items) || [], sel = SP.cwhSel || new Set(), CL = (SP.info && SP.info.clanLeader) || '';
    const chosen = all.filter(r => sel.has(cwhKey(r))); if (!chosen.length || !CL) return;
    const byId = {}; chosen.forEach(r => { byId[r.id] = (byId[r.id] || 0) + r.count; });
    const mixed = Object.keys(byId).filter(id => all.some(r => String(r.id) === id && !sel.has(cwhKey(r)))).map(id => all.find(r => String(r.id) === id).name.replace(/^\+\d+ /, ''));
    const list = chosen.slice(0, 40).map(r => `${r.name}${r.count > 1 ? ' ×' + r.count : ''}`).concat(chosen.length > 40 ? [`… and ${chosen.length - 40} more`] : []);
    const body = [uiP(uiEm(CL), sell ? ' walks to the warehouse keeper in Giran, takes these out of the clan warehouse, walks to the grocer and sells exactly these pieces (nothing else from his bag), then walks back:' : ' walks to the warehouse keeper in Giran and takes these out of the clan warehouse into his bag:'), uiList(list)];
    if (mixed.length) body.push(uiWarn(`Some of these exist with other enchant levels in the warehouse (${mixed.slice(0, 5).join(', ')}${mixed.length > 5 ? ' …' : ''}): the highest enchant comes out first.`));
    body.push(uiNote(sell ? 'He takes out as much as he can carry, sells it, and goes back for more until the list is done. He stops what he is doing for this (a raid, Kamaloka or mission must end first) and goes back to it at the very end. Report in party chat and Logs/whsell.log.' : 'He stops what he is doing for this (a raid, Kamaloka or mission must end first). Report in party chat.'));
    let always = null;   // ALWAYS SELL: one choice in this dialog instead of the same order every hour
    if (sell) {
      body.push(uiNote('"Sell now + always sell these": these kinds are never stored again, and whatever lands in the clan warehouse is taken out and sold by itself (never an enchanted piece).'));
      const v = await uiChoice({ title: `Take out and sell ${chosen.length} kind${chosen.length === 1 ? '' : 's'}?`, body, buttons: [{ label: 'Sell now + always sell these', value: 'always', primary: true }, { label: 'Sell only this time', value: 'once' }] });
      if (!v) return; always = { checked: v === 'always' };
    } else if (!(await uiConfirm({ title: sell ? `Take out and sell ${chosen.length} kind${chosen.length === 1 ? '' : 's'}?` : `Take out ${chosen.length} kind${chosen.length === 1 ? '' : 's'}?`, body, confirmText: sell ? 'Take out and sell' : 'Take out', cancelText: 'Cancel', danger: sell }))) return;
    let d = null; try { d = await api('/api/storage/whsell', { method: 'POST', body: JSON.stringify({ items: Object.keys(byId).map(id => ({ id: Number(id), count: byId[id] })), sell }) }); } catch (e) { d = { error: e.message }; }
    if (!d || !d.ok) { await uiError((d && d.error) || 'no answer (the dashboard server may need a restart)', 'Not sent'); return; }
    if (always && always.checked) await alwaysSell(chosen);
    if (await send('!whsell order', CL)) { flash(`${CL}: ${sell ? 'take out and sell' : 'take out'} ${d.n} kind${d.n === 1 ? '' : 's'} — sent. See "What they do".`); SP.cwhSel = new Set(); renderCwhList(); }
  }
  /** LOOT RULES 2026-10-13: one line per party + "⚙ Loot settings" (the party settings popup, Loot section; Dashboard/partysettings.js) */
  function renderLoot() {
    const el = $id('stgLoot'); if (!el) return;
    const L = SP.loot, P = (SP.info && SP.info.parties) || [];
    const rows = P.map(p => { const x = L && (L.parties || []).find(q => q.leader === p.leader), sum = x ? x.summary : L ? 'Off — everyone keeps what it finds.' : '…';
      return `<div class="stg-lootrow"><span><b>Party ${h(p.leader)}</b> — ${h(sum)}</span><button type="button" class="psbtn sm" data-psopen="${h(p.leader)}" data-psopensec="loot" title="Party ${h(p.leader)}: what happens to its loot">⚙ Loot settings</button></div>`; }).join('');
    el.innerHTML = `<div class="fnd-hint">What happens to the loot a party picks up — hand it to a collector (the clan leader or a character you choose) or keep it on the character that found it — is set per party in <b>⚙ Settings → Loot</b>. A party without a loot rule: everyone keeps what it finds.${L ? '' : ' (The loot rules appear after a dashboard server restart.)'}</div>${rows}`;
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
    let html = P.map(p => {
      const lv = obj(obj(R.parties)[p.leader]), inh = eff(Object.assign({}, R, { parties: {} }), '', p.leader);
      const autoN = p.members.filter(m => eff(R, m.name, p.leader).auto).length;
      return `<div class="fnd-party stg-party"><div class="ph"><b>Party ${h(p.leader)}</b><span class="muted">${p.members.length} char${p.members.length === 1 ? '' : 's'} · ${autoN ? autoN + ' store automatically' : 'nobody stores automatically'}</span></div>
        ${levelEditor('parties|' + p.leader, lv, inh)}
        <details class="fnd-mems" data-stgparty="${h(p.leader)}" ${SP.openParties.has(p.leader) ? 'open' : ''}><summary>Characters (${p.members.length})</summary>${p.members.map(m => charRow(m, p.leader)).join('')}</details></div>`;
    }).join('') || '<div class="muted">No parties in swarm.config.json.</div>';
    // STGORPHAN-2026-10-23 (public tester 1.8.17: "storage tab - can't delete crafter1 char"): settings of a character that is in no party any
    // more (deleted / renamed / moved to another PC) were never shown, so they could never be removed. List them with a Delete button.
    const known = new Set(); P.forEach(p => (p.members || []).forEach(m => known.add(m.name)));
    const orphans = Object.keys(obj(R.chars)).filter(n => !known.has(n)).sort();
    if (orphans.length) html += `<div class="fnd-party stg-party stg-orphans"><div class="ph"><b>Characters in no party</b><span class="muted">${orphans.length} saved here but not in any party any more</span></div>
      ${orphans.map(n => `<div class="stg-orphan"><b>${h(n)}</b> <span class="muted">${h(Object.keys(obj(R.chars[n])).filter(k => !k.startsWith('_')).join(', ') || 'empty')}</span> <button type="button" data-stgact="forget" data-n="${h(n)}">Delete these settings</button></div>`).join('')}</div>`;
    el.innerHTML = html;
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
    if (t.dataset.stgcoll) { const C = SP.cur.collector = obj(SP.cur.collector); const k = t.dataset.stgcoll; if (k === 'on') C.on = !!t.checked; else C[k] = t.value; if (!C.town) C.town = 'Giran'; if (C.name === undefined) C.name = ''; renderColl(); renderBar(); return; }   // COLLECTOR
    if (t.dataset.cwhgrade) { SP.cwhGrade = t.value || ''; renderCwhList(); return; }   // CWHGROUPS
    if (t.dataset.cwh) { SP.cwhSel = SP.cwhSel || new Set(); if (t.checked) SP.cwhSel.add(t.dataset.cwh); else SP.cwhSel.delete(t.dataset.cwh); renderCwhList(); return; }   // WHSELL
    if (t.dataset.stgnv) { const N = SP.cur.neverStore = obj(SP.cur.neverStore); N[t.dataset.stgnv] = !!t.checked; if (!Array.isArray(N.names)) N.names = []; renderNever(); renderBar(); return; }
    if (t.dataset.stgnvnames) { const v = t.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean); const bad = v.filter(x => { try { new RegExp(x, 'i'); return false; } catch (er) { return true; } });
      if (bad.length) { SP.err.neverNames = 'not a valid pattern: ' + bad.join(', '); t.classList.add('bad'); renderBar(); return; }
      delete SP.err.neverNames; t.classList.remove('bad'); const N = SP.cur.neverStore = obj(SP.cur.neverStore); N.names = v; N.common = N.common === true; N.sell = N.sell === true; renderBar(); return; }
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
    const sa = e.target.closest('button[data-cwhsellall]');   // SELLALL: tick the whole group, then the normal take out and sell (with its confirmation)
    if (sa) { const all = (SP.info && SP.info.clanWh && SP.info.clanWh.items) || [], prev = SP.cwhSel || new Set(), tmp = new Set(all.filter(r => r.cat === sa.dataset.cwhsellall).map(cwhKey));
      SP.cwhSel = tmp; cwhRun(true).then(() => { if (SP.cwhSel === tmp) { SP.cwhSel = prev; renderCwhList(); } }); return; }
    const wr = e.target.closest('button[data-waact]'); if (wr) { waRun(); return; }   // WHAUTO-2026-10-16
    const cg = e.target.closest('button[data-cwhcat]'); if (cg) { SP.cwhCat = cg.dataset.cwhcat || ''; renderCwhList(); return; }   // CWHGROUPS
    const ca = e.target.closest('button[data-cwhact]');   // WHSELL
    if (ca) {
      const a = ca.dataset.cwhact; SP.cwhSel = SP.cwhSel || new Set();
      if (a === 'common') { SP.cwhCommon = !SP.cwhCommon; ca.classList.toggle('on', SP.cwhCommon); ca.setAttribute('aria-pressed', String(SP.cwhCommon)); renderCwhList(); return; }
      if (a === 'all') { cwhRows().forEach(r => SP.cwhSel.add(cwhKey(r))); renderCwhList(); return; }
      if (a === 'none') { SP.cwhSel.clear(); renderCwhList(); return; }
      if (a === 'sell' || a === 'take') return cwhRun(a === 'sell');
      if (a === 'give') return cwhGive();   // CWHGIVE-2026-10-16
      if (a === 'cry') return cwhCry();   // CRYQUEUE-2026-10-15
      if (a === 'defsell' || a === 'defcry' || a === 'defnone') return waSetDefault(a === 'defsell' ? 'sell' : a === 'defcry' ? 'cry' : null);   // WHAUTO-2026-10-16
      if (a === 'pending') { const CL = (SP.info && SP.info.clanLeader) || ''; if (!CL) return; if (!(await uiConfirm({ title: 'Sell what is still in his bag?', body: [uiP(uiEm(CL), ' goes to Giran and sells the pieces an earlier take-out left in his bag (nothing else). Then he goes back to what he was doing.')], confirmText: 'Sell them', cancelText: 'Cancel' }))) return; if (await send('!whsell pending', CL)) flash(`${CL}: selling what is still in his bag — sent.`); return; }   // WHSELL-FIX
      return;
    }
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
      // STGORPHAN-2026-10-23: with item rules left the old button seemed to do nothing ("can't delete") - offer removing everything too
      const c0 = obj(obj(SP.cur.chars)[n]), rules = ['keepNames', 'depositNames', 'keep', 'deposit'].some(k => Array.isArray(c0[k]) && c0[k].length);
      const pick = rules ? await uiChoice({ title: `${n}: use the party / default settings?`, body: [uiP('Remove only ', uiEm(n), '’s own warehouse, mode, automatic, trigger and town settings, or everything including its item rules (keep / store lists)?')],
          buttons: [{ label: 'Own settings only', value: 'own' }, { label: 'Everything (item rules too)', value: 'all', primary: true, danger: true }] })
        : ((await uiConfirm({ title: `${n}: use the party / default settings?`, body: [uiP('Removes ', uiEm(n), '’s own warehouse, mode, automatic, trigger and town settings.')], confirmText: 'Remove own settings', cancelText: 'Cancel' })) ? 'own' : null);
      if (!pick) return;
      const c = obj(obj(SP.cur.chars)[n]); ['dest', 'mode', 'auto', 'trigger', 'town'].forEach(k => delete c[k]);
      if (SP.cur.chars && (pick === 'all' || !Object.keys(c).filter(k => !k.startsWith('_')).length)) delete SP.cur.chars[n];
      render(); flash(`${n}: ${pick === 'all' ? 'all its settings removed' : 'own settings removed'} — press Save.`); return;
    }
    if (act === 'forget') {
      if (!(await uiConfirm({ title: `Delete ${n}'s storage settings?`, body: [uiP(uiEm(n), ' is in no party. Its saved storage settings and item rules are removed from the file. Press Save afterwards.')], confirmText: 'Delete', cancelText: 'Cancel', danger: true }))) return;
      if (SP.cur.chars) delete SP.cur.chars[n]; SP.openChars.delete(n); render(); flash(`${n}: settings removed — press Save.`); return;
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
    if (f(a.collector) !== f(b.collector)) { const C = obj(b.collector), CL = (SP.info && SP.info.clanLeader) || 'the clan leader'; out.push(C.on ? `Collector ON: ${C.name || CL} stays in ${C.town || 'Giran'} (no hunting; stores, sells, receives by itself)` : 'Collector off'); }   // COLLECTOR
    if (f(a.neverStore) !== f(b.neverStore)) { const N = obj(b.neverStore); out.push(`Never store: ${N.common ? 'Common items' : 'Common items may be stored'}${(N.names || []).length ? ', names: ' + N.names.join(', ') : ''} — ${N.sell ? 'sold instead' : 'kept in the bag'}`); }   // WHSELL
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
