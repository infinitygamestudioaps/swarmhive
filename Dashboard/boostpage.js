// BOOST page #/boost[/<Name>] (BOOST-2026-11-05; owner: "build exactly this script [Adrenaline 'Boost'] for Hive so i can use while im in game").
// Tab "Enchant items" like Boost: Standard / Fast + delay, Enchant all, a rule list (item + scroll + range, ticked rules run), Add / Delete,
// Start / Stop and the live log. The rules are kept per character in this browser (localStorage); Start sends them with the order
// (!boost item <Name> <mode> <min>-<max> <all> <itemId:objId:scroll:from:to;...>) to that character's swarm.js (swarm.js BOOST block) - it
// also runs while the owner plays the character in the client. Live view: /api/state chars[].boost. Other tabs: built next.
(function () {
  'use strict';
  const SEC = 'tab-boost';
  const S = { open: false, name: '', bag: [], tab: 'items', sel: -1, poll: 0, live: null, msg: '' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const keyQ = () => { const k = new URLSearchParams(location.search).get('key'); return k ? 'key=' + encodeURIComponent(k) : ''; };
  const get = async (u) => { if (typeof api === 'function') return api(u); const k = keyQ(); const r = await fetch(u + (k ? (u.includes('?') ? '&' : '?') + k : '')); return r.json(); };
  const post = async (u, b) => { if (typeof api === 'function') return api(u, { method: 'POST', body: JSON.stringify(b) }); const k = keyQ(); const r = await fetch(u + (k ? '?' + k : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return r.json(); };
  const LS = (n) => 'boost_cfg_' + n;
  const cfgOf = (n) => { try { const c = JSON.parse(localStorage.getItem(LS(n)) || 'null'); if (c && Array.isArray(c.rules)) return c; } catch (e) { } return { mode: 'fast', dMin: 100, dMax: 100, all: true, rules: [] }; };
  const cfgSave = (n, c) => { try { localStorage.setItem(LS(n), JSON.stringify(c)); } catch (e) { } };
  const TABS = [['combine', 'Combine items'], ['skills', 'Enchant skills'], ['talis', 'Buy talismans'], ['augment', 'Augment items'], ['items', 'Enchant items'], ['attr', 'Attribute items']];
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win bstp'; s.hidden = true;
    s.innerHTML = `<style>
      .bstp .bs-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin:6px 0}
      .bstp .bs-tabs button{padding:6px 2px;font-size:13px}.bstp .bs-tabs button.on{outline:2px solid var(--gold,#c9a54a)}.bstp .bs-tabs button.soon{opacity:.45}
      .bstp .bs-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}.bstp .bs-row label{display:flex;gap:4px;align-items:center}
      .bstp input[type=number]{width:72px;font-size:16px}.bstp select{max-width:100%;font-size:15px;min-width:0}
      .bstp .bs-tbl{width:100%;border-collapse:collapse;font-size:13px}.bstp .bs-tbl td,.bstp .bs-tbl th{padding:4px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left}
      .bstp .bs-tbl tr.sel{background:rgba(201,165,74,.15)}.bstp .bs-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px}
      .bstp .bs-go{width:100%;padding:12px;font-size:17px;margin:8px 0}.bstp .bs-go.stop{color:#ff6b6b}.bstp .bs-go.start{color:#6bd46b}
      .bstp .bs-log{font-family:monospace;font-size:12px;white-space:pre-wrap;max-height:220px;overflow:auto;opacity:.9}
      @media (max-width:520px){.bstp .bs-grid{grid-template-columns:minmax(0,1fr)}}
    </style><div class="whead"><h2>Boost</h2><span class="muted" id="bsSub"></span></div><div id="bsBody"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('change', onChange);
    return s;
  }
  function route(kind, arg) { if (kind === 'boost') { open(arg ? decodeURIComponent(arg) : ''); return true; } close(); return false; }
  function open(name) {
    const s = section();
    try { stopChar(); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; window.scrollTo(0, 0);
    S.name = name || S.name || (localStorage.getItem('boost_last') || '');
    render(); if (S.name) loadBag();
    clearInterval(S.poll); S.poll = setInterval(() => { if (S.open && !document.hidden) loadLive(); }, 2000);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); const s = $id(SEC); if (s) s.hidden = true; }
  async function loadBag() {
    S.msg = 'loading the bag…'; render();
    try { const d = await get('/api/items/char?fresh=1&name=' + encodeURIComponent(S.name)); S.bag = (d && d.bag) || []; S.msg = d && d.ok ? '' : ((d && d.error) || 'no bag'); }
    catch (e) { S.msg = e.message; }
    render(); loadLive();
  }
  async function loadLive() {
    try { const st = await get('/api/state'); const c = (st.chars || []).find(x => x.name === S.name); S.live = c ? (c.boost || null) : null; S.online = !!(c && Number(c.ageSec) < 120); }
    catch (e) { }
    const L = $id('bsLive'); if (L) L.innerHTML = liveHtml(); const g = $id('bsGo'); if (g) { const on = !!(S.live && S.live.on); g.textContent = on ? 'Stop' : 'Start'; g.className = 'bs-go ' + (on ? 'stop' : 'start'); }
  }
  const equip = () => S.bag.filter(b => /Weapon|Armor|Accessory|Accessary/i.test(String(b.type || '')) || b.slot);
  const scrolls = () => S.bag.filter(b => /enchant/i.test(b.name) && /scroll/i.test(b.name));
  const itemLabel = (b) => `${b.enchant ? '+' + b.enchant + ' ' : ''}${b.name}${b.grade && b.grade !== 'NONE' ? ' [' + b.grade + ']' : ''}${b.eq ? ' (worn)' : ''} / ID: ${b.id}`;
  function liveHtml() {
    const L = S.live; if (!L) return `<div class="muted">${S.online === false ? S.name + ' is not online' : 'not running'}</div>`;
    if (L.mode === 'talismans') return `<div>${L.on ? '▶ buying' : '■ stopped'} · ${L.ok} bought · ${L.fail} not</div><div>${L.cur ? `<b>${h(L.cur.name)}</b> at ${h(L.cur.scroll)}` : h(L.why || '')}</div><div class="bs-log">${h((L.log || []).slice().reverse().join('\n'))}</div>`;
    const c = L.cur ? `<b>${h(L.cur.name)}</b> +${L.cur.lvl} → +${L.cur.to} (scroll ${L.cur.scroll})` : h(L.why || '');
    return `<div>${L.on ? '▶ running' : '■ stopped'} · ${L.tries} tries · ${L.ok} up · ${L.fail} down · ${L.broke} broke</div><div>${c}</div><div class="bs-log">${h((L.log || []).slice().reverse().join('\n'))}</div>`;
  }
  function render() {
    section(); const B = $id('bsBody'); if (!B) return;
    $id('bsSub').textContent = S.name ? S.name : '';
    const tabs = `<div class="bs-tabs">${TABS.map(([k, t]) => `<button data-bstab="${k}" class="${k === S.tab ? 'on' : ''} ${k === 'combine' ? 'soon' : ''}">${h(t)}</button>`).join('')}</div>`;
    const who = `<div class="bs-row"><label>Character <input id="bsName" value="${h(S.name)}" placeholder="name" style="width:150px;font-size:16px"></label><button data-bs="load">Load</button><span class="muted">${h(S.msg)}</span></div>`;
    if (!S.name) { B.innerHTML = who + '<div class="muted">Type the character you play and press Load.</div>'; return; }
    if (S.tab === 'skills') { B.innerHTML = who + tabs + skillsHtml(); return; }
    if (S.tab === 'augment') { B.innerHTML = who + tabs + augHtml(); return; }
    if (S.tab === 'attr') { B.innerHTML = who + tabs + attrHtml(); return; }
    if (S.tab === 'talis') { B.innerHTML = who + tabs + talisHtml(); return; }
    if (S.tab !== 'items') { B.innerHTML = who + tabs + `<div class="muted" style="padding:12px 0">${h(TABS.find(t => t[0] === S.tab)[1])}: runes / combining do not exist in High Five (L2Toggle) - nothing to build here.</div>`; return; }
    const c = cfgOf(S.name), E = equip(), SC = scrolls();
    const rows = c.rules.map((r, i) => `<tr class="${i === S.sel ? 'sel' : ''}" data-bsrow="${i}"><td><input type="checkbox" data-bson="${i}" ${r.on !== false ? 'checked' : ''}></td><td>${h(r.itemName)}</td><td>${h(r.scrollName)}</td><td>${r.from} - ${r.to}</td></tr>`).join('');
    B.innerHTML = who + tabs + `
      <div class="bs-row"><label><input type="radio" name="bsMode" value="standard" ${c.mode === 'standard' ? 'checked' : ''}> Standard</label><label><input type="radio" name="bsMode" value="fast" ${c.mode !== 'standard' ? 'checked' : ''}> Fast</label>
        <span>Delay (ms)</span><input type="number" id="bsDMin" min="0" value="${c.dMin}"> – <input type="number" id="bsDMax" min="0" value="${c.dMax}">
        <label><input type="checkbox" id="bsAll" ${c.all ? 'checked' : ''}> Enchant all</label></div>
      <table class="bs-tbl"><tr><th></th><th>Item</th><th>Scroll</th><th>Range</th></tr>${rows || '<tr><td colspan="4" class="muted">no rules yet - add one below</td></tr>'}</table>
      <div class="bs-grid" style="margin-top:8px">
        <label>Item<br><select id="bsItem">${E.map(b => `<option value="${b.objId}">${h(itemLabel(b))}</option>`).join('') || '<option value="">(no equipment in the bag)</option>'}</select></label>
        <label>Scroll<br><select id="bsScroll">${SC.map(b => `<option value="${b.id}">${h(b.name)} (${b.count})</option>`).join('') || '<option value="">(no enchant scroll in the bag)</option>'}</select></label>
      </div>
      <div class="bs-row"><span>Range</span><input type="number" id="bsFrom" min="0" max="30" value="0"> – <input type="number" id="bsTo" min="1" max="30" value="3"></div>
      <div class="bs-grid"><button data-bs="add">Add</button><button data-bs="del" ${S.sel < 0 ? 'disabled' : ''}>Delete</button></div>
      <button id="bsGo" class="bs-go start" data-bs="go">Start</button>
      <div id="bsLive">${liveHtml()}</div>
      <div class="muted" style="font-size:12px;margin-top:6px">The rule whose range holds the item's + level picks the scroll (e.g. 0 - 3 normal scroll, 3 - 16 blessed: a blessed fail drops to +0 and the 0 - 3 rule takes over). Enchant all = every item with that ID in the bag. It stops by itself when a scroll runs out or every item is at the top of its range. Works while you play ${h(S.name)} in the client.</div>`;
  }
  // ---- BOOSTTABS-2026-11-05: Enchant skills / Augment items / Attribute items ----
  const goBtn = () => `<button id="bsGo" class="bs-go ${S.live && S.live.on ? 'stop' : 'start'}" data-bs="go2">${S.live && S.live.on ? 'Stop' : 'Start'}</button><div id="bsLive">${liveHtml()}</div>`;
  const delayRow = (c) => `<div class="bs-row"><span>Delay (ms)</span><input type="number" id="bsDMin" min="0" value="${c.dMin}"> – <input type="number" id="bsDMax" min="0" value="${c.dMax}"></div>`;
  function skillsHtml() {
    const c = cfgOf(S.name), sk = (S.skills || []).filter(s => s.is_enchantable || s.level > 100);
    const rows = (c.skillRules || []).map((r, i) => `<tr class="${i === S.sel ? 'sel' : ''}" data-bsrow="${i}"><td><input type="checkbox" data-bsskon="${i}" ${r.on !== false ? 'checked' : ''}></td><td>${h(r.name)} / ID: ${r.id}</td><td>${r.route}</td><td>${r.from} - ${r.to}</td><td>${r.safe ? '+++' : ''}</td></tr>`).join('');
    return delayRow(c) + `<table class="bs-tbl"><tr><th></th><th>Skill</th><th>Branch</th><th>Range</th><th>Bless</th></tr>${rows || '<tr><td colspan="5" class="muted">no rules yet</td></tr>'}</table>
      <div class="bs-grid" style="margin-top:8px"><label>Skill<br><select id="bsSkill">${sk.map(s => `<option value="${s.skill_id}">${h(s.name)} / ID: ${s.skill_id} (lv ${s.level})</option>`).join('') || '<option value="">(no enchantable skill - level 76+ 3rd class)</option>'}</select></label>
      <div class="bs-row"><label>Branch <select id="bsRoute">${[1, 2, 3, 4, 5, 6].map(n => `<option>${n}</option>`).join('')}</select></label><label><input type="checkbox" id="bsSafe"> Bless (safe)</label></div></div>
      <div class="bs-row"><span>Range</span><input type="number" id="bsFrom" min="0" max="30" value="0"> – <input type="number" id="bsTo" min="1" max="30" value="15"></div>
      <div class="bs-grid"><button data-bs="addsk">Add</button><button data-bs="delsk" ${S.sel < 0 ? 'disabled' : ''}>Delete</button></div>${goBtn()}
      <div class="muted" style="font-size:12px">The rule whose + range holds the skill's + level picks normal or Bless (safe: Giant's Codex - Mastery, a fail keeps the level). A normal fail drops the skill to its base level and the 0 - N rule takes over. Needs SP, adena and the codex.</div>`;
  }
  function augHtml() {
    const c = cfgOf(S.name), a = c.aug || {}, E = equip().filter(b => /Weapon/i.test(String(b.type || '')) || /weapon/i.test(String(b.slot || ''))), ST = S.bag.filter(b => /Life Stone/i.test(b.name)), GM = S.bag.filter(b => /^Gemstone/i.test(b.name));
    const opts = (S.augOpts || []).map(o => `<label style="display:flex;gap:6px;align-items:flex-start;padding:2px 0"><input type="checkbox" data-bsaugw="${o.id}" ${(a.wanted || []).includes(o.id) ? 'checked' : ''}><span>${h(o.text)} <span class="muted">(${o.pct}% · ${h(o.kind)})</span></span></label>`).join('');
    return `<div class="bs-grid"><label>Item<br><select id="bsAugItem">${E.map(b => `<option value="${b.objId}" ${a.objId === b.objId ? 'selected' : ''}>${h(itemLabel(b))}</option>`).join('') || '<option value="">(no weapon in the bag)</option>'}</select></label>
      <label>Life Stone<br><select id="bsAugStone">${ST.map(b => `<option value="${b.id}" ${a.stone === b.id ? 'selected' : ''}>${h(b.name)} (${b.count})</option>`).join('') || '<option value="">(no life stone in the bag)</option>'}</select></label></div>
      <div class="bs-grid"><label>Gemstone<br><select id="bsAugGem">${GM.map(b => `<option value="${b.id}" ${a.gem === b.id ? 'selected' : ''}>${h(b.name)} (${b.count})</option>`).join('') || '<option value="">(no gemstone in the bag)</option>'}</select></label>
      <div class="bs-row"><label>Gems per try <input type="number" id="bsAugGc" min="1" value="${a.gemCount || 20}"></label><label>Max tries <input type="number" id="bsAugMax" min="1" max="500" value="${a.max || 50}"></label></div></div>
      <div class="bs-row"><label>Weapon type <select id="bsAugType"><option value="warrior" ${a.type !== 'mage' ? 'selected' : ''}>fighter</option><option value="mage" ${a.type === 'mage' ? 'selected' : ''}>mage</option></select></label><button data-bs="augload">Show the bonuses of this stone</button></div>
      <div style="max-height:260px;overflow:auto">${opts || '<div class="muted">pick the stone and press "Show the bonuses" - then tick the ones you want</div>'}</div>${goBtn()}
      <div class="muted" style="font-size:12px">Augments the weapon; not one of the ticked bonuses = the bonus is removed (adena) and the next stone goes in, until a wanted one comes, max tries or no stones. Gems per try: C 20, B 30, A 20, S 25 (H5).</div>`;
  }
  function attrHtml() {
    const c = cfgOf(S.name), a = c.attr || {}, E = equip().filter(b => /Weapon/i.test(String(b.type || ''))), ST = S.bag.filter(b => /(Stone|Crystal|Jewel|Energy) of /i.test(b.name) || /Attribute/i.test(b.name));
    return delayRow(c) + `<div class="bs-grid"><label>Weapon<br><select id="bsAtItem">${E.map(b => `<option value="${b.objId}" ${a.objId === b.objId ? 'selected' : ''}>${h(itemLabel(b))}</option>`).join('') || '<option value="">(no weapon in the bag)</option>'}</select></label>
      <label>Attribute stone<br><select id="bsAtStone">${ST.map(b => `<option value="${b.id}" ${a.stone === b.id ? 'selected' : ''}>${h(b.name)} (${b.count})</option>`).join('') || '<option value="">(no attribute stone / crystal in the bag)</option>'}</select></label></div>
      <div class="bs-row"><label>Up to attribute value <input type="number" id="bsAtTo" min="1" max="450" value="${a.to || 150}"></label></div>${goBtn()}
      <div class="muted" style="font-size:12px">Uses the stone on the weapon again and again until its attribute reaches the value, no stone is left or Stop. Stones go to 150, crystals to 300 (H5).</div>`;
  }
  // ---- BOOSTTALIS-2026-11-06: Buy talismans (Giran Accessory Merchant Sandra / Ellie, multisell 300900001, 12,000 adena each) ----
  const TALIS = [[10533, 'Blue Talisman - P. Atk.'], [10534, 'Blue Talisman - Shield Defense'], [10535, 'Yellow Talisman - P. Def.'], [10536, 'Yellow Talisman - M. Atk.'],
    [10537, 'Yellow Talisman - Evasion'], [10538, 'Yellow Talisman - Healing Power'], [10539, 'Yellow Talisman - CP Recovery Rate'], [10540, 'Yellow Talisman - HP Recovery Rate'],
    [10541, 'Yellow Talisman - Low Grade MP Recovery Rate'], [10542, 'Red Talisman - HP/CP Recovery'], [10543, 'Yellow Talisman - Speed']];
  const TALIS_PRICE = 12000;
  const bagN = (id) => S.bag.filter(b => b.id === id).reduce((s, b) => s + (Number(b.count) || 1), 0);
  function talisHtml() {
    const c = cfgOf(S.name), q = c.talis || {}, total = TALIS.reduce((s, [id]) => s + (Number(q[id]) || 0), 0);
    const rows = TALIS.map(([id, n]) => `<tr><td>${h(n)}</td><td class="muted">${bagN(id) || ''}</td><td><input type="number" min="0" max="200" data-bstalis="${id}" value="${Number(q[id]) || 0}"></td></tr>`).join('');
    return `<table class="bs-tbl"><tr><th>Talisman</th><th>In bag</th><th>Buy</th></tr>${rows}</table>
      <div class="bs-row"><b>${total} talisman(s) · ${(total * TALIS_PRICE).toLocaleString('en')} adena</b>${bagN(57) ? `<span class="muted">${h(S.name)} has ${bagN(57).toLocaleString('en')} adena</span>` : ''}</div>${goBtn()}
      <div class="muted" style="font-size:12px">${h(S.name)} must be in Giran. He walks up to the Accessory Merchant Sandra ("Buy a bracelet or talisman.") and buys the numbers above, 12,000 adena each. Nothing is bought automatically - only when you press Start.</div>`;
  }
  async function loadSkills() { try { const d = await get('/api/char?name=' + encodeURIComponent(S.name)); S.skills = (d && d.skills) || []; } catch (e) { S.skills = []; } render(); }
  async function augLoad() {
    const st = Number(($id('bsAugStone') || {}).value), ty = String(($id('bsAugType') || {}).value || 'warrior'); if (!st) return;
    try { const d = await get(`/api/augments/stone?id=${st}&type=${ty}`); const o = []; (d.lines || []).forEach(l => (l.cats || []).forEach(c => (c.opts || []).forEach(x => o.push({ id: x.id, text: `L${l.line}: ${x.text}`, pct: x.pct, kind: x.kind })))); S.augOpts = o; } catch (e) { S.augOpts = []; }
    render();
  }
  function readAug(c) { c.aug = Object.assign(c.aug || {}, { objId: Number(($id('bsAugItem') || {}).value) || 0, stone: Number(($id('bsAugStone') || {}).value) || 0, gem: Number(($id('bsAugGem') || {}).value) || 0, gemCount: Number(($id('bsAugGc') || {}).value) || 20, max: Number(($id('bsAugMax') || {}).value) || 50, type: String(($id('bsAugType') || {}).value || 'warrior') }); }
  function readAttr(c) { c.attr = { objId: Number(($id('bsAtItem') || {}).value) || 0, stone: Number(($id('bsAtStone') || {}).value) || 0, to: Number(($id('bsAtTo') || {}).value) || 150 }; }
  async function go2() {
    if (S.live && S.live.on) { await send(`!boost stop ${S.name}`); return; }
    const c = cfgOf(S.name); readDelay(c);
    if (S.tab === 'skills') {
      const rs = (c.skillRules || []).filter(r => r.on !== false); if (!rs.length) { S.msg = 'tick at least one skill rule'; render(); return; }
      if (!confirm(`Start skill enchanting on ${S.name}? It spends SP, adena and codices until Stop or the top of every range.`)) return;
      cfgSave(S.name, c); await send(`!boost skill ${S.name} ${c.dMin}-${c.dMax} ${rs.map(r => `${r.id}:${r.route}:${r.from}:${r.to}:${r.safe ? 1 : 0}`).join(';')}`); return;
    }
    if (S.tab === 'augment') {
      readAug(c); const a = c.aug; if (!a.objId || !a.stone || !a.gem) { S.msg = 'pick the weapon, a life stone and the gemstone'; render(); return; }
      if (!confirm(`Start augmenting on ${S.name}? Up to ${a.max} life stones (+ gemstones and removal adena) until a ticked bonus comes.`)) return;
      cfgSave(S.name, c); await send(`!boost aug ${S.name} ${a.objId} ${a.stone} ${a.gem} ${a.gemCount} ${a.max} ${(a.wanted || []).length ? a.wanted.join(',') : '-'}`); return;
    }
    if (S.tab === 'talis') {
      const q = c.talis || {}, list = TALIS.filter(([id]) => Number(q[id]) > 0).map(([id, n]) => ({ id, n, count: Math.min(200, Math.floor(Number(q[id]))) }));
      if (!list.length) { S.msg = 'type how many of at least one talisman'; render(); return; }
      const sum = list.reduce((s, t) => s + t.count, 0);
      if (!confirm(`Buy on ${S.name} at Sandra (Giran):\n${list.map(t => t.count + ' x ' + t.n).join('\n')}\n= ${(sum * TALIS_PRICE).toLocaleString('en')} adena. Buy?`)) return;
      await send(`!boost talis ${S.name} ${list.map(t => t.id + ':' + t.count).join(';')}`); return;
    }
    if (S.tab === 'attr') {
      readAttr(c); const a = c.attr; if (!a.objId || !a.stone) { S.msg = 'pick the weapon and an attribute stone'; render(); return; }
      if (!confirm(`Start attributing on ${S.name}? Stones are used until the value ${a.to}.`)) return;
      cfgSave(S.name, c); await send(`!boost attr ${S.name} ${c.dMin}-${c.dMax} ${a.objId} ${a.stone} ${a.to}`);
    }
  }
  function readDelay(c) { if ($id('bsDMin')) { c.dMin = Math.max(0, Number($id('bsDMin').value) || 0); c.dMax = Math.max(c.dMin, Number($id('bsDMax').value) || 0); } }
  function readTop(c) {
    const m = document.querySelector('input[name=bsMode]:checked'); c.mode = m ? m.value : 'fast';
    c.dMin = Math.max(0, Number(($id('bsDMin') || {}).value) || 0); c.dMax = Math.max(c.dMin, Number(($id('bsDMax') || {}).value) || 0); c.all = !!($id('bsAll') || {}).checked;
  }
  async function onClick(e) {
    const t = e.target.closest('[data-bs],[data-bstab],[data-bsrow]'); if (!t) return;
    if (t.dataset.bstab) { S.tab = t.dataset.bstab; S.sel = -1; if (S.tab === 'skills' && !S.skills) loadSkills(); render(); return; }
    if (t.dataset.bs === 'go2') { await go2(); return; }
    if (t.dataset.bs === 'augload') { const c0 = cfgOf(S.name); readAug(c0); cfgSave(S.name, c0); await augLoad(); return; }
    if (t.dataset.bs === 'addsk') {
      const c0 = cfgOf(S.name), id = Number(($id('bsSkill') || {}).value), from = Number(($id('bsFrom') || {}).value), to = Number(($id('bsTo') || {}).value);
      const sk = (S.skills || []).find(s => s.skill_id === id); if (!sk || !(to > from)) { S.msg = 'pick a skill and a range (to > from)'; render(); return; }
      (c0.skillRules = c0.skillRules || []).push({ on: true, id, name: sk.name, route: Number(($id('bsRoute') || {}).value) || 1, from, to, safe: !!($id('bsSafe') || {}).checked }); cfgSave(S.name, c0); render(); return;
    }
    if (t.dataset.bs === 'delsk') { const c0 = cfgOf(S.name); if (S.sel >= 0 && c0.skillRules) { c0.skillRules.splice(S.sel, 1); cfgSave(S.name, c0); S.sel = -1; render(); } return; }
    if (t.dataset.bsrow !== undefined && !e.target.dataset.bson) { S.sel = Number(t.dataset.bsrow); render(); return; }
    const a = t.dataset.bs, c = cfgOf(S.name);
    if (a === 'load') { S.name = String(($id('bsName') || {}).value || '').trim(); if (S.name) { localStorage.setItem('boost_last', S.name); try { history.replaceState(null, '', '#/boost/' + encodeURIComponent(S.name)); } catch (er) { } loadBag(); } return; }
    if (a === 'add') {
      readTop(c); const ob = Number(($id('bsItem') || {}).value), sc = Number(($id('bsScroll') || {}).value), from = Number(($id('bsFrom') || {}).value), to = Number(($id('bsTo') || {}).value);
      const it = S.bag.find(b => b.objId === ob), sb = S.bag.find(b => b.id === sc);
      if (!it || !sb || !(to > from) || from < 0) { S.msg = 'pick an item, a scroll and a range (to > from)'; render(); return; }
      c.rules.push({ on: true, itemId: it.id, objId: it.objId, itemName: itemLabel(it), scroll: sb.id, scrollName: sb.name, from, to }); cfgSave(S.name, c); S.msg = ''; render(); return;
    }
    if (a === 'del') { if (S.sel >= 0) { c.rules.splice(S.sel, 1); cfgSave(S.name, c); S.sel = -1; render(); } return; }
    if (a === 'go') {
      if (S.live && S.live.on) { await send(`!boost stop ${S.name}`); return; }
      readTop(c); cfgSave(S.name, c);
      const rs = c.rules.filter(r => r.on !== false); if (!rs.length) { S.msg = 'tick at least one rule'; render(); return; }
      const rules = rs.map(r => `${r.itemId}:${r.objId}:${r.scroll}:${r.from}:${r.to}`).join(';');
      if (!confirm(`Start enchanting on ${S.name}? ${rs.length} rule(s) - it goes on until Stop, no scroll left or every item is at the top of its range.`)) return;
      await send(`!boost item ${S.name} ${c.mode} ${c.dMin}-${c.dMax} ${c.all ? 1 : 0} ${rules}`);
    }
  }
  function onChange(e) {
    const ds = e.target.dataset || {};
    if (ds.bsaugw !== undefined) { const c = cfgOf(S.name); readAug(c); const id = Number(ds.bsaugw), w = new Set(c.aug.wanted || []); if (e.target.checked) w.add(id); else w.delete(id); c.aug.wanted = [...w]; cfgSave(S.name, c); return; }
    if (ds.bstalis !== undefined) { const c = cfgOf(S.name); c.talis = c.talis || {}; c.talis[Number(ds.bstalis)] = Math.max(0, Math.min(200, Math.floor(Number(e.target.value) || 0))); cfgSave(S.name, c); render(); return; }
    if (ds.bsskon !== undefined) { const c = cfgOf(S.name), r = (c.skillRules || [])[Number(ds.bsskon)]; if (r) { r.on = !!e.target.checked; cfgSave(S.name, c); } return; }
    if (S.tab !== 'items') { const c = cfgOf(S.name); readDelay(c); if (S.tab === 'augment') readAug(c); if (S.tab === 'attr') readAttr(c); cfgSave(S.name, c); return; }
    const on = e.target.dataset && e.target.dataset.bson; if (on === undefined) { if (/^bs(DMin|DMax|All)$/.test(e.target.id) || e.target.name === 'bsMode') { const c = cfgOf(S.name); readTop(c); cfgSave(S.name, c); } return; }
    const c = cfgOf(S.name), r = c.rules[Number(on)]; if (r) { r.on = !!e.target.checked; cfgSave(S.name, c); }
  }
  async function send(cmd) {
    try { const r = await post('/api/command', { cmd, targets: ['char:' + S.name], confirm: true }); S.msg = r && r.ok ? 'sent' : ((r && r.error) || 'not sent'); }
    catch (e) { S.msg = e.message; }
    render(); setTimeout(loadLive, 1500);
  }
  window.BoostPage = { route, open, close, _state: S };
})();
