// NAV ATLAS PAGE (2026-10-12): #/navatlas[/<target key>] — look up any raid boss / epic / NPC / field area / dungeon room / dungeon entrance,
// see its precomputed route (Scripts/data/nav_atlas, docs/plan/tools/nav_atlas.js) as steps and on the game map (/minitile art), plus the
// unreachable / blocked lists (with the reason), the doors (kinds, timed doors with their cycle, the doors blocking most targets) and the last
// routes the bots ran (Logs/nav_atlas_runs.log). Data: /api/navatlas (Dashboard/navatlas_api.js). Read-only: it never sends an order.
(function () {
  'use strict';
  const SEC = 'navAtlasSec', MT = 8192;
  const $id = (i) => document.getElementById(i);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const A = { open: false, view: 'search', q: '', type: '', status: '', rows: [], counts: null, walks: null, key: '', listRows: [], doors: null, runs: null, err: '' };
  const get = (u) => (typeof api === 'function' ? api(u) : fetch(u).then(r => r.json()));
  function css() { if ($id('navAtlasCssLink') || [...document.querySelectorAll('link[rel=stylesheet]')].some(l => /navatlas\.css/.test(l.href))) return; const l = document.createElement('link'); l.id = 'navAtlasCssLink'; l.rel = 'stylesheet'; l.href = '/navatlas.css'; document.head.appendChild(l); }
  function section() {
    let s = $id(SEC); if (s) return s;
    css();
    s = document.createElement('section'); s.id = SEC; s.className = 'win na'; s.hidden = true;
    s.innerHTML = `<h2>Navigation atlas</h2><div class="na-sum" id="naCounts"></div>
<div class="na-tabs" role="tablist"><button data-view="search">Search</button><button data-view="unreachable">Unreachable</button><button data-view="blocked">Blocked</button><button data-view="doors">Doors</button><button data-view="runs">Bot runs</button></div>
<div id="naSearch"><div class="row"><input id="naQ" placeholder="boss / NPC / area / room name or id" aria-label="search">
<select id="naType" aria-label="type"><option value="">all types</option><option>raid</option><option>epic</option><option>npc</option><option>area</option><option>room</option><option>dungeon</option></select>
<select id="naStatus" aria-label="status"><option value="">any status</option><option>ok</option><option>unverified</option><option>conditional</option><option>blocked</option><option>unreachable</option></select></div></div>
<div class="res" id="naRes" role="list"></div><div id="naRoute"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    let t = null;
    s.addEventListener('input', (e) => { if (e.target.id === 'naQ') { A.q = e.target.value; clearTimeout(t); t = setTimeout(search, 250); } });
    s.addEventListener('change', (e) => { if (e.target.id === 'naType') { A.type = e.target.value; search(); } if (e.target.id === 'naStatus') { A.status = e.target.value; search(); } });
    s.addEventListener('click', (e) => {
      const v = e.target.closest('[data-view]'); if (v) { setView(v.dataset.view); return; }
      const r = e.target.closest('[data-key]'); if (r) { location.hash = '#/navatlas/' + encodeURIComponent(r.dataset.key); }
    });
    s.addEventListener('keydown', (e) => { const r = e.target.closest('[data-key]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = '#/navatlas/' + encodeURIComponent(r.dataset.key); } });
    return s;
  }
  function setView(v) {
    A.view = v; document.querySelectorAll(`#${SEC} .na-tabs button`).forEach(b => b.classList.toggle('on', b.dataset.view === v));
    $id('naSearch').hidden = v !== 'search'; $id('naRes').classList.toggle('tall', v === 'doors' || v === 'runs');
    if (v === 'search') search(); else if (v === 'doors') doors(); else if (v === 'runs') runs(); else list(v);
  }
  async function search() {
    try { const d = await get(`/api/navatlas?q=${encodeURIComponent(A.q)}&type=${A.type}&status=${A.status}`); A.rows = d.rows || []; A.counts = d.counts; A.walks = d.walks; A.err = d.error || ''; } catch (e) { A.err = e.message; }
    renderCounts(); $id('naRes').innerHTML = A.err ? `<div class="why">${E(A.err)}</div>` : A.rows.map(rowHtml).join('') || '<div class="muted">no match</div>';
  }
  async function list(which) {
    $id('naRes').innerHTML = '<div class="muted">loading…</div>';
    try { const d = await get(`/api/navatlas?list=${which}`); A.listRows = d.rows || []; A.err = d.error || ''; } catch (e) { A.err = e.message; }
    $id('naRes').innerHTML = A.err ? `<div class="why">${E(A.err)}</div>` : `<div class="muted">${A.listRows.length} ${which} target(s) — tap one for its steps</div>` + A.listRows.map(t => rowHtml(t) .replace(/<\/div>$/, `<div class="why">${E(t[12] || '')}</div></div>`)).join('');
  }
  async function doors() {
    const box = $id('naRes'); box.innerHTML = '<div class="muted">loading…</div>';
    try { A.doors = await get('/api/navatlas?doors=1'); } catch (e) { box.innerHTML = `<div class="why">${E(e.message)}</div>`; return; }
    const D = A.doors; if (D.error) { box.innerHTML = `<div class="why">${E(D.error)}</div>`; return; }
    const st = D.stats || {};
    const needTxt = (n) => !n ? '' : n.wait ? `timer: closed ${n.wait.closedFor.join('-')} s, open ${n.wait.openFor.join('-')} s` : n.npc ? 'talk to ' + n.npc.map(x => x.name).join(' / ') : n.items ? 'key ' + n.items.map(i => i.name || i.id).join(' / ') + (n.unlock ? ' or Unlock' : '') : n.unlock ? 'Unlock (dagger)' : (n.why || n.owner || (n.script || []).join('; ') || 'blocked');
    box.innerHTML = `<div style="padding:8px"><div class="na-kinds">${Object.entries(D.byKind || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span>${E(k)} ${n}</span>`).join('')}</div>
<div class="muted">${st.doors || 0} doors, ${st.blocking || 0} closed with collision · ${st.timed || 0} timed · ${st.unlockable || 0} Unlock · ${st.keyed || 0} key · ${st.scripted || 0} script · ${st.bossZones || 0} boss zones · ${st.conditions || 0} entry conditions</div>
<details open><summary><b>Doors that block the most targets</b> (${(D.blocking || []).length})</summary><div class="tblwrap"><table><tr><th>door</th><th>where</th><th>targets</th><th>why</th></tr>${(D.blocking || []).map(o => `<tr><td>${o.id} ${E(o.name)} <span class="muted">${E(o.kind)}</span></td><td>${E(placeTxt(o.place))}</td><td>${o.blocked}${o.examples.length ? `<br>${o.examples.map(k => `<a href="#/navatlas/${encodeURIComponent(k)}">${E(k)}</a>`).join(' ')}` : ''}</td><td class="why">${E(needTxt(o.need))}</td></tr>`).join('')}</table></div></details>
<details><summary><b>Doors on the most routes</b></summary><div class="tblwrap"><table><tr><th>door</th><th>where</th><th>routes</th><th>how to pass</th></tr>${(D.onRoutes || []).map(o => `<tr><td>${o.id} ${E(o.name)} <span class="muted">${E(o.kind)}</span></td><td>${E(placeTxt(o.place))}</td><td>${o.n}</td><td>${E(needTxt(o.need))}</td></tr>`).join('')}</table></div></details>
<details><summary><b>Timed doors</b> (${(D.timed || []).length} groups)</summary><div class="tblwrap"><table><tr><th>where</th><th>doors</th><th>open</th><th>closed</th><th>cycle</th></tr>${(D.timed || []).map(t => `<tr><td>${E(t.place)} <span class="muted">${E(t.name)}</span></td><td>${t.doors.length}</td><td>${t.openFor.join('-')} s</td><td>${t.closedFor.join('-')} s</td><td>${t.periodMin}-${t.periodMax} s</td></tr>`).join('')}</table></div></details>
<details><summary><b>Entry conditions</b> (${(D.conditions || []).length})</summary>${(D.conditions || []).map(c => `<div style="margin:4px 0"><b>${E(c.area || c.key)}</b> <span class="muted">${E(c.kind)} · ${E(c.read)}</span><br>${E(c.text || '')} <span class="muted">${E(c.src || '')}</span></div>`).join('')}</details>
${D.unlock ? `<details><summary><b>Unlock (skill 27)</b></summary><div>${E((D.unlock.learnedBy || []).map(c => c.name).join(', '))}</div><div class="muted">chance by skill level: ${E((D.unlock.chance || []).join(' / '))}</div><div class="muted">${E(D.unlock.rule || '')}</div></details>` : ''}</div>`;
  }
  async function runs() {
    const box = $id('naRes'); box.innerHTML = '<div class="muted">loading…</div>';
    try { A.runs = (await get('/api/navatlas?runs=1')).runs || []; } catch (e) { box.innerHTML = `<div class="why">${E(e.message)}</div>`; return; }
    box.innerHTML = A.runs.length ? A.runs.map(r => { const k = (r.msg.match(/^((?:raid|npc|area|room|dungeon):\S+?):? /) || [])[1]; return `<div${k ? ` data-key="${E(k)}" tabindex="0"` : ''}><span class="muted">${E(r.at.replace('T', ' ').slice(5, 19))}</span> <b>${E(r.who)}</b> ${/FAILED|not used/.test(r.msg) ? `<span class="why">${E(r.msg)}</span>` : E(r.msg)}</div>`; }).join('') : '<div class="muted">no bot has run an atlas route yet (Logs/nav_atlas_runs.log)</div>';
  }
  const placeTxt = (p) => !p ? '' : p.dungeon ? p.dungeon + (p.floor ? ' · ' + p.floor : '') : p.town || p.region || (p.nearTown ? 'near ' + p.nearTown.name : '');
  function renderCounts() {
    if (!A.counts) return;
    $id('naCounts').textContent = Object.entries(A.counts).map(([k, c]) => `${k} ${c.targets} (ok ${c.ok}, unverified ${c.unverified}, conditional ${c.conditional}, blocked ${c.blocked}, unreachable ${c.unreachable})`).join(' · ') + (A.walks ? ` · geodata walks: ${A.walks.cached} cached, ${A.walks.pending} pending` : '');
  }
  const rowHtml = (t) => `<div data-key="${E(t[0])}" role="listitem" tabindex="0"><b>${E(t[2])}</b> <span class="muted">${E(t[1])} · ${E(t[0])}</span><span class="st ${E(t[6])}">${E(t[6])}</span> <span class="muted">${t[7] ? Math.round(t[7] / 1000) + 'k' : ''} ${t[8] ? '~' + Math.round(t[8] / 60) + ' min' : ''}</span></div>`;
  const stepTxt = (s) => {
    if (s.do === 'town') return `<b>${E(s.cmd)}</b> (to ${E(s.town)})`;
    if (s.do === 'gk') return `gatekeeper ${E(s.npc ? s.npc.name : '')} in ${E(s.from)}: "<b>${E(s.linkLive || s.link)}</b>" ${s.live === true ? '(live menu)' : s.live === false ? '<span class="why">(not on the live menu)</span>' : '(menu not recorded)'}${s.price ? ' · ' + s.price + ' adena' : ''}`;
    if (s.do === 'walk') return `walk ${Math.round(s.len)} (${E(s.how)}${s.danger ? ', monsters up to lvl ' + s.danger : ''})${s.why ? ` <span class="why">${E(s.why)}</span>` : ''}`;
    if (s.do === 'door') { const n = s.need || {}; return `<b>door ${s.doorId}</b> ${E(s.name)} (${E(s.kind)}): ${n.wait ? `wait — closed ${n.wait.closedFor.join('-')} s / open ${n.wait.openFor.join('-')} s (~${n.wait.expectSec} s expected)` : n.npc ? 'talk to ' + E(n.npc.map(x => x.name + ' ' + x.id).join(' / ')) + (n.anyItem ? ' with item ' + n.anyItem.join(' / ') : '') + (n.closesAfterSec ? `, open ${n.closesAfterSec} s` : '') : n.items ? 'key ' + E(n.items.map(i => i.name + ' ' + i.id).join(' / ')) + (n.unlock ? ' or Unlock 27' : '') : n.unlock ? 'Unlock 27 (dagger classes)' : `<span class="why">${E(n.why || n.owner || (n.script || []).join('; ') || 'blocked')}</span>`}`; }
    if (s.do === 'floor') return `teleporter ${E(s.npc.name)} ${s.link ? '"' + E(s.link) + '"' : ''}${s.floorName ? ' → ' + E(s.floorName) : ''}`;
    if (s.do === 'enter') return `enter (${E(s.how)}) at ${E(s.npc ? s.npc.name + ' ' + s.npc.id : '')}${s.condition ? ' <span class="muted">[' + E(s.condition) + ']</span>' : ''}`;
    if (s.do === 'arrive') return `arrive at ${Math.round(s.x)},${Math.round(s.y)},${Math.round(s.z)}`;
    return E(s.do);
  };
  function mapSvg(r) {
    const P = []; r.steps.forEach(s => { if (s.do === 'walk') for (let i = 0; i + 2 < s.points.length; i += 3) P.push([s.points[i], s.points[i + 1]]); else if (s.at && s.do === 'door') P.push([s.at[0], s.at[1]]); else if (s.landing) P.push([s.landing[0], s.landing[1]]); });
    if (r.target && isFinite(r.target.x)) P.push([r.target.x, r.target.y]);
    if (!P.length) return '';
    const x1 = Math.min(...P.map(p => p[0])), x2 = Math.max(...P.map(p => p[0])), y1 = Math.min(...P.map(p => p[1])), y2 = Math.max(...P.map(p => p[1]));
    const W = Math.max(x2 - x1, y2 - y1, 3000) * 1.15, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, x0 = cx - W / 2, y0 = cy - W / 2, u = W / 800;
    let tiles = '';
    if (W < 120000) for (let gx = Math.floor(x0 / MT); gx * MT < x0 + W; gx++) for (let gy = Math.floor(y0 / MT); gy * MT < y0 + W; gy++) {
      const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, cc = gx - Math.floor(gx / 4) * 4, rr = gy - Math.floor(gy / 4) * 4;
      tiles += `<image href="/minitile/${RX}_${RY}_${cc}_${rr}.jpg" x="${gx * MT}" y="${gy * MT}" width="${MT}" height="${MT}" preserveAspectRatio="none"/>`;
    }
    let g = '';
    r.steps.forEach(s => {
      if (s.do === 'walk') { const pts = []; for (let i = 0; i + 2 < s.points.length; i += 3) pts.push(s.points[i] + ',' + s.points[i + 1]); g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.how === 'straight' ? '#f84' : '#4cf'}" stroke-width="${3 * u}" ${s.how === 'straight' ? `stroke-dasharray="${8 * u} ${6 * u}"` : ''}/>`; }
    });
    const mk = (x, y, col, txt) => { g += `<circle cx="${x}" cy="${y}" r="${6 * u}" fill="${col}" stroke="#000" stroke-width="${u}"/><text x="${x + 8 * u}" y="${y - 6 * u}" fill="#fff" font-size="${12 * u}" stroke="#000" stroke-width="${0.4 * u}">${E(txt)}</text>`; };
    r.steps.forEach(s => {
      if (s.do === 'door') mk(s.at[0], s.at[1], s.need && s.need.blocked ? '#f44' : '#fa4', 'door ' + s.doorId);
      if (s.do === 'gk' && s.landing) mk(s.landing[0], s.landing[1], '#4f4', s.link);
      if (s.do === 'floor' && s.npc) mk(s.npc.x, s.npc.y, '#c6f', s.npc.name);
      if (s.do === 'enter' && s.npc) mk(s.npc.x, s.npc.y, '#fc4', s.npc.name);
      if (s.do === 'arrive') mk(s.x, s.y, '#ff4', r.name);
    });
    return `<svg class="na-map" viewBox="${x0} ${y0} ${W} ${W}" role="img" aria-label="route map">${tiles}${g}</svg>
<div class="na-legend"><span><i style="background:#4cf"></i>walk on the geodata</span><span><i style="background:#f84"></i>not computed yet (straight)</span><span><i style="background:#4f4"></i>gatekeeper landing</span><span><i style="background:#fa4"></i>door</span><span><i style="background:#f44"></i>blocked door</span><span><i style="background:#c6f"></i>floor teleporter</span><span><i style="background:#fc4"></i>entry NPC</span></div>`;
  }
  async function showRoute(key) {
    A.key = key; const box = $id('naRoute'); box.innerHTML = '<div class="muted">loading…</div>';
    let r = null; try { const d = await get(`/api/navatlas?key=${encodeURIComponent(key)}`); r = d.route; if (!r) { box.innerHTML = `<div class="why">${E(d.error || 'no route')}</div>`; return; } } catch (e) { box.innerHTML = `<div class="why">${E(e.message)}</div>`; return; }
    const n = r.needs || {};
    const needs = [].concat((n.items || []).map(i => `item ${i.name} ${i.id}${i.consumed ? ' (used up)' : ''}`), (n.other || []).map(o => o.anyItem ? 'one of ' + (o.text || o.anyItem.join('/')) : o.sevenSigns ? 'Seven Signs: ' + (o.sevenSigns.validation || 'registered') : o.party ? 'party' + (o.party === 'leader' ? ' leader' : '') : o.commandChannel ? 'command channel' : o.bossState ? 'boss: ' + o.bossState : o.quest ? 'quest ' + o.quest : o.noble ? 'Noblesse' : o.unknown ? 'entry unknown' : JSON.stringify(o)), n.level ? [`level ${n.level.min || ''}${n.level.max ? ' ≤ ' + n.level.max : '+'}`] : [], (n.skills || []).map(s => `skill ${s.name} ${s.id}`));
    box.innerHTML = `<h3>${E(r.name)} <span class="st ${E(r.status)}">${E(r.status)}</span></h3>
<div class="muted">${E(r.key)} · ${E(r.type)} · source ${E(r.source)} · ${Math.round((r.length || 0) / 1000)}k on foot · ~${Math.round((r.sec || 0) / 60)} min · monsters up to lvl ${r.maxDanger || 0}${(r.flags || []).length ? ' · ' + E(r.flags.join(', ')) : ''}</div>
${needs.length ? `<div><b>Needs:</b> ${E(needs.join(' · '))} <span class="muted">(the bots say what is missing before leaving, and go anyway)</span></div>` : ''}${(r.why || []).length ? `<div class="why">${E(r.why.join(' · '))}</div>` : ''}
${(r.conditions || []).length ? `<details><summary>Conditions (${r.conditions.length})</summary>${r.conditions.map(c => `<div><b>${E(c.key)}</b> (${E(c.read)}): ${E(c.text)} <span class="muted">${E(c.src)}</span></div>`).join('')}</details>` : ''}
<ol class="na-steps">${r.steps.map(s => `<li class="${s.do === 'door' ? 'door' + (s.need && s.need.blocked ? ' blocked' : '') : ''}">${stepTxt(s)}</li>`).join('')}</ol>${r.alt ? `<div class="muted">2nd best: ${E(r.alt.via)} · ${Math.round((r.alt.length || 0) / 1000)}k${r.alt.walksPending ? ' (walk not computed yet)' : ''}</div>` : ''}${mapSvg(r)}`;
  }
  /** ROUTE VIEW 2026-10-12: the shared block under the steps (which path the bots use, doors / needs, where to get the items) */
  function routeViewUnder(key) { const box = $id('naRoute'); if (!box || !window.RouteView || A.key !== key) return; let el = $id('naRV'); if (!el) { el = document.createElement('div'); el.id = 'naRV'; el.className = 'na-rv'; box.appendChild(el); } RouteView.mount(el, key, { map: false }); }
  function route(kind, arg) {
    if (kind !== 'navatlas') { if (A.open) { A.open = false; const s = $id(SEC); if (s) s.hidden = true; } return false; }
    const s = section();
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; A.open = true;
    if (!A.rows.length && A.view === 'search') setView('search'); else if (!document.querySelector(`#${SEC} .na-tabs button.on`)) setView(A.view);
    const key = arg ? decodeURIComponent(location.hash.replace(/^#\/navatlas\/?/, '')) : '';
    if (key) showRoute(key).then(() => routeViewUnder(key)).catch(() => { }); else $id('naRoute').innerHTML = '';
    return true;
  }
  window.NavAtlasPage = { route };
})();
