// QUEST PLAN VIEW + ROUTE OVERRIDE EDITOR (QUESTPLAN-2026-10-27; owner: "you should be able to follow live and see what quest it's on and step etc,
// even change the pathfinding for a specific quest IF it should NOT work"). Mounted by Dashboard/questpage.js in the quest detail ("Bot plan").
// Data: GET /api/quests/plan?id= (Dashboard/questplan_api.js: the plan of docs/plan/tools/quest_plan_build.js + the characters running it), every
// 4 s while visible. Shows: the plan status + reasons, every step (what / where / how to get there / checks / reasons), the map (step places, routes,
// characters live, the current step highlighted). "Override route" per step: a waypoint list (map taps add points, "add <character>'s position",
// "start from the computed route"), the start (.town / gatekeeper), another NPC place, another hunting place, "manual" (the bot stops before it),
// a note -> POST /api/quests/plan (locked + atomic + history). Quest switches: skip (never started by the bots) / manual.
// Uses index.html globals when present: api, esc, MT, uiConfirm, uiAlert, STATE.
(function () {
  'use strict';
  const QP = { el: null, id: null, d: null, timer: 0, sel: null, ed: null, busy: false, msg: '' };
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const get = async (u, o) => { if (typeof api === 'function') return api(u, o); const r = await fetch(u, o); return r.json(); };
  const KM = (u) => u == null ? '' : u >= 1000 ? (Math.round(u / 100) / 10) + ' km' : Math.round(u) + ' m';
  const KIND = { start: '⚑ accept', talk: '💬 talk', deliver: '📦 deliver', hunt: '⚔ hunt', spawn: '✴ spawn + kill', special: '⚙ script' };
  const STC = { ready: 'qpl-ok', fixable: 'qpl-fix', 'not-for-bots': 'qpl-nfb' };
  const COL = ['#f0c040', '#5aa9ff', '#3ddc84', '#ff9a3d', '#d6b3ff', '#ff6b9d', '#7ee0e0', '#c0c0ff'];
  function mount(el, id) {
    if (!el) return;
    if (QP.el !== el || QP.id !== id) { QP.sel = null; QP.ed = null; QP.d = null; }
    QP.el = el; QP.id = id;
    el.classList.add('qpl');
    if (!el.dataset.qplBound) { el.dataset.qplBound = '1'; el.addEventListener('click', onClick); el.addEventListener('input', onInput); el.addEventListener('change', onInput); }
    load(); clearInterval(QP.timer); QP.timer = setInterval(() => { if (!document.hidden && QP.el && document.body.contains(QP.el)) load(); else if (QP.el && !document.body.contains(QP.el)) stop(); }, 4000);
  }
  function stop() { clearInterval(QP.timer); QP.timer = 0; }
  async function load() {
    try { const d = await get('/api/quests/plan?id=' + encodeURIComponent(QP.id)); QP.d = d; } catch (e) { QP.d = { error: e.message }; }
    if (QP.ed && QP.el && QP.el.contains(document.activeElement) && document.activeElement.closest('.qpl-ed')) return;   // typing in the editor: no repaint
    render();
  }
  const planOf = () => QP.d && QP.d.plan;
  // the override on disk (plan.override.steps[key]) is the truth: a save shows at once, before the next builder run copies it into the step
  function ovOf(s) { const p = planOf(); return (s && p && p.override && p.override.steps && p.override.steps[s.key]) || s.override || null; }
  function stepRoute(s) { const o = ovOf(s); if (o && Array.isArray(o.route) && o.route.length) return { pts: o.route, kind: 'override' }; const t = s.travel; return t && (t.pv || t.points) ? { pts: t.pv || t.points, kind: t.src } : null; }
  function stepAt(s) { const o = ovOf(s) || {}; if (o.npcAt) return o.npcAt; if (o.area && o.area.at) return o.area.at; if (s.npc && s.npc.at) return s.npc.at; if (s.area && s.area.at) return s.area.at; return null; }
  function render() {
    const el = QP.el; if (!el) return;
    const d = QP.d;
    if (!d) { el.innerHTML = '<div class="muted">loading the bot plan…</div>'; return; }
    if (d.error || !d.ok) { el.innerHTML = `<div class="muted">${h((d && d.error) || 'no plan')}${/not found|404|unknown quests endpoint/i.test(String(d && d.error)) ? ' — the dashboard server needs a restart for /api/quests/plan' : ''}</div>`; return; }
    const p = d.plan, live = d.live || [], ov = p.override || {};
    const liveBy = {}; live.forEach(c => { if (c.stepI != null) (liveBy[c.stepI] = liveBy[c.stepI] || []).push(c); });
    const rs = [...new Set((p.reasons || []).map(r => r.code))];
    let s = `<div class="qpl-head"><span class="qpl-st ${STC[p.status] || ''}">${h(p.status)}</span>${rs.map(c => `<span class="qpl-chip" title="${h(((p.reasons || []).find(r => r.code === c) || {}).text || c)}">${h(c)}</span>`).join('')}
      <span class="muted">~${h(p.expectedMin)} min · ${p.steps.length} steps · plan ${h(String(p.generated || '').slice(0, 16).replace('T', ' '))}</span></div>
      <div class="qpl-qsw"><label><input type="checkbox" data-qpl="qskip"${ov.skip ? ' checked' : ''}> skip this quest (the bots never start it)</label>
      <label><input type="checkbox" data-qpl="qmanual"${ov.manual ? ' checked' : ''}> needs me (manual)</label>
      <input type="text" data-qpl="qnote" placeholder="note" value="${h(ov.note || '')}" maxlength="300"><button type="button" data-qpl="qsave">Save</button></div>`;
    if (live.length) s += `<div class="qpl-live">${live.map(c => `<div class="qpl-lrow${c.ended ? ' ended' : ''}"><b>${h(c.name)}</b>${c.online ? '' : ' <span class="muted">(offline)</span>'} · ${c.stepI != null ? 'step ' + (c.stepI + 1) + '/' + p.steps.length : 'cond ' + h(c.cond)} · ${h(c.phase)}${c.routeN ? ` · route point ${h(c.routeI || 0)}/${h(c.routeN)}${c.src ? ' (' + h(c.src) + ')' : ''}` : ''}${c.waitWhy ? ` · <span class="qpl-wait">waits: ${h(c.waitWhy)}</span>` : ''}<div class="muted">${h(c.stepText || c.step)}</div></div>`).join('')}</div>`;
    s += `<div class="qpl-grid"><ol class="qpl-steps">${p.steps.map((st, i) => stepHtml(st, i, liveBy[i])).join('')}</ol><div class="qpl-mapw"><div class="qpl-map" id="qplMap">${mapSvg(p, live)}</div>
      <div class="muted qpl-leg">numbers = step places · lines = routes (dashed = computed, solid gold = your own route) · white dots = characters${QP.ed ? ' · <b>tap the map to add a route point</b>' : ''}</div></div></div>`;
    if (QP.ed) s += editorHtml(p);
    if (QP.msg) s += `<div class="qpl-msg" role="status">${h(QP.msg)}</div>`;
    const ae = document.activeElement, keep = ae && el.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) ? { k: ae.dataset.qpl, v: ae.value, s: ae.selectionStart } : null;
    el.innerHTML = s;
    if (keep && keep.k) { const n = el.querySelector(`[data-qpl="${keep.k}"]`); if (n) { n.focus(); try { if (n.value !== keep.v && keep.k !== 'qnote') n.value = keep.v; n.setSelectionRange(keep.s, keep.s); } catch (e) { } } }
    const svg = el.querySelector('#qplMap svg'); if (svg) svg.addEventListener('click', onMap);
  }
  function stepHtml(st, i, lv) {
    const o = ovOf(st) || {}, t = st.travel || {}, ck = t.checks || {};
    const where = st.npc ? `${h(st.npc.name)}${st.npc.town ? ' · ' + h(st.npc.town) : ''}${st.npc.at ? ` <small class="muted">${st.npc.at.join(', ')}</small>` : ' <small class="muted">no spawn</small>'}`
      : st.area ? `${h(st.area.name)}${st.area.count ? ' <small class="muted">' + st.area.count + ' spawns</small>' : ''}${(st.places || []).length > 1 ? ' <small class="muted">+' + (st.places.length - 1) + ' more places</small>' : ''}` : '<span class="muted">no place</span>';
    const what = st.kind === 'hunt' || st.kind === 'spawn' ? `${(st.monsters || []).map(m => h(m.name) + (m.level ? ' <small>' + m.level + '</small>' : '')).join(', ')}${(st.items || []).length ? ' → ' + st.items.map(x => h(x.name) + ' x' + x.n + (x.from && x.from[0] && x.from[0].chance != null ? ' <small>(' + x.from[0].chance + '%)</small>' : '')).join(', ') : ''}${st.kills ? ' · kill ' + st.kills : ''}` : (st.needs || []).length ? 'bring ' + st.needs.map(x => h(x.name) + ' x' + x.n).join(', ') : '';
    const how = o.route ? `<b class="qpl-own">your own route</b> ${o.route.length} points${o.start ? ' from ' + h(o.start.kind === 'town' ? '.' + String(o.start.town).toLowerCase() : o.start.desc) : ''}`
      : t.src ? `${h(t.via || '')} · ${KM(t.length)} · ~${Math.round((t.sec || 0) / 60)} min · <span class="qpl-ts qpl-ts-${h(t.status)}">${h(t.src)} ${h(t.status)}</span>` : '<span class="muted">no route</span>';
    const checks = [ck.danger ? 'danger ' + ck.danger + (ck.dangerVsLevel > 0 ? ' (+' + ck.dangerVsLevel + ')' : '') : '', ck.water ? 'swim ' + KM(ck.water.swimLen) + (ck.water.overBreath ? ' ⚠' : '') : '', (ck.aggro || []).length ? 'aggro: ' + ck.aggro.slice(0, 3).map(a => a.name + ' ' + a.lv).join(', ') : '', ck.walls && /straight/.test(ck.walls) ? ck.walls : ''].filter(Boolean);
    return `<li class="qpl-step${QP.sel === i ? ' sel' : ''}${lv && lv.length ? ' cur' : ''}" data-qpl="sel" data-i="${i}"><div><span class="qpl-n" style="background:${COL[i % COL.length]}">${i + 1}</span> <b>${h(KIND[st.kind] || st.kind)}</b> ${h(st.text || '')}${(st.conds || []).length > 1 ? ` <small class="muted">conds ${st.conds.join(',')}</small>` : ''}${lv && lv.length ? ` <span class="qpl-here">▶ ${lv.map(c => h(c.name)).join(', ')}</span>` : ''}</div>
      ${what ? `<div class="qpl-what">${what}</div>` : ''}<div class="qpl-where">📍 ${where}</div><div class="qpl-how">🧭 ${how}</div>
      ${checks.length ? `<div class="muted qpl-ck">${h(checks.join(' · '))}</div>` : ''}
      ${(st.reasons || []).length ? `<div>${st.reasons.map(c => `<span class="qpl-chip">${h(c)}</span>`).join('')}${st.engineWhy ? ` <small class="muted">${h(st.engineWhy)}</small>` : ''}</div>` : ''}
      ${(st.fixedByOverride || []).length ? `<div class="muted">fixed by your override: ${h(st.fixedByOverride.join(', '))}</div>` : ''}
      ${o.manual || o.note ? `<div class="qpl-own">${o.manual ? '✋ manual — the bot stops before this step. ' : ''}${h(o.note || '')}</div>` : ''}
      <div class="qpl-btns"><button type="button" data-qpl="edit" data-i="${i}">✎ Override route</button>${Object.keys(o).length ? ` <button type="button" data-qpl="clear" data-i="${i}">Remove override</button>` : ''}</div></li>`;
  }
  // ------------------------------------------------------------------------------------------------ map
  function mapSvg(p, live) {
    const P = [];
    p.steps.forEach((st, i) => { if (QP.sel != null && QP.sel !== i && !(QP.ed && QP.ed.i === i)) return; const a = stepAt(st); if (a) P.push([a[0], a[1]]); const r = stepRoute(st); if (r) r.pts.forEach(q => P.push([q[0], q[1]])); });
    if (QP.ed) QP.ed.pts.forEach(q => P.push([q[0], q[1]]));
    live.forEach(c => { if (c.x != null && (QP.sel == null || c.stepI === QP.sel)) P.push([c.x, c.y]); });
    if (!P.length) return '<div class="muted">no coordinates</div>';
    const xs = P.map(q => q[0]), ys = P.map(q => q[1]);
    let cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, R = Math.min(60000, Math.max(2500, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 * 1.2 + 800));
    if (QP.ed) { if (!QP.ed.view) QP.ed.view = { cx, cy, R }; ({ cx, cy, R } = QP.ed.view); }   // editing: the view stays put while points are added
    const W = 2 * R, x0 = cx - R, y0 = cy - R, u = W / 520, T = typeof MT === 'number' ? MT : 8192;
    let s = '';
    for (let gx = Math.floor(x0 / T); gx * T < x0 + W; gx++) for (let gy = Math.floor(y0 / T); gy * T < y0 + W; gy++) {
      const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, c = gx - Math.floor(gx / 4) * 4, r = gy - Math.floor(gy / 4) * 4;
      s += `<image href="/minitile/${RX}_${RY}_${c}_${r}.jpg" x="${gx * T}" y="${gy * T}" width="${T}" height="${T}" preserveAspectRatio="none"/>`;
    }
    const lab = (x, y, t, col, sz) => `<text x="${x}" y="${y}" font-size="${(sz || 10) * u}" fill="${col || '#fff'}" paint-order="stroke" stroke="#000" stroke-width="${3 * u}" pointer-events="none">${h(t)}</text>`;
    p.steps.forEach((st, i) => {
      if (QP.sel != null && QP.sel !== i) return;
      const col = COL[i % COL.length], r = stepRoute(st);
      if (r && r.pts.length > 1 && !(QP.ed && QP.ed.i === i)) s += `<polyline points="${r.pts.map(q => q[0] + ',' + q[1]).join(' ')}" fill="none" stroke="${r.kind === 'override' ? '#f0c040' : col}" stroke-width="${(r.kind === 'override' ? 3 : 2) * u}" ${r.kind === 'override' ? '' : `stroke-dasharray="${6 * u} ${4 * u}"`} opacity="0.9"/>`;
      if (st.area && st.area.at && (st.kind === 'hunt' || st.kind === 'spawn')) s += `<circle cx="${st.area.at[0]}" cy="${st.area.at[1]}" r="${Math.max(st.area.radius || 800, 6 * u)}" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-width="${u}"/>`;
      const a = stepAt(st); if (a) s += `<circle cx="${a[0]}" cy="${a[1]}" r="${8 * u}" fill="${col}" stroke="#000" stroke-width="${u}"><title>${h((i + 1) + '. ' + (st.text || ''))}</title></circle>` + `<text x="${a[0]}" y="${a[1] + 3.5 * u}" font-size="${10 * u}" text-anchor="middle" fill="#000" pointer-events="none">${i + 1}</text>`;
    });
    if (QP.ed && QP.ed.pts.length) { s += `<polyline points="${QP.ed.pts.map(q => q[0] + ',' + q[1]).join(' ')}" fill="none" stroke="#f0c040" stroke-width="${3 * u}"/>`; QP.ed.pts.forEach((q, k) => { s += `<circle cx="${q[0]}" cy="${q[1]}" r="${4 * u}" fill="#f0c040" stroke="#000" stroke-width="${u}"/>` + lab(q[0] + 5 * u, q[1] - 3 * u, String(k + 1), '#f0c040', 8); }); }
    live.forEach(c => { if (c.x == null || c.x < x0 || c.x > x0 + W || c.y < y0 || c.y > y0 + W) return; s += `<circle cx="${c.x}" cy="${c.y}" r="${5 * u}" fill="#fff" stroke="#000" stroke-width="${u}"/>` + lab(c.x + 7 * u, c.y - 4 * u, c.name + (c.stepI != null ? ' (' + (c.stepI + 1) + ')' : ''), '#fff', 9); });
    return `<svg viewBox="${x0} ${y0} ${W} ${W}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="quest plan map" style="cursor:${QP.ed ? 'crosshair' : 'default'}">${s}</svg>`;
  }
  function onMap(e) {
    if (!QP.ed) return;
    const svg = e.currentTarget, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return; const w = pt.matrixTransform(m.inverse());
    const prev = QP.ed.pts[QP.ed.pts.length - 1];
    QP.ed.pts.push([Math.round(w.x), Math.round(w.y), prev ? prev[2] : 0]); syncText(); render();
  }
  // ------------------------------------------------------------------------------------------------ editor
  function edOpen(i) {
    const st = planOf().steps[i], o = ovOf(st) || {}, t = st.travel || {};
    QP.sel = i;
    QP.ed = { i, key: st.key, pts: (o.route || []).map(q => q.slice()), start: o.start ? (o.start.kind === 'town' ? 'town:' + o.start.town : 'gk:' + o.start.from + '|' + o.start.desc) : '', npcAt: o.npcAt ? o.npcAt.join(', ') : '',
      area: o.area ? o.area.at.join(', ') : '', radius: o.area ? o.area.radius : 1500, aname: o.area ? o.area.name : '', manual: !!o.manual, note: o.note || '', text: '' , tStart: t.start || null, comp: t.points || t.pv || null };
    syncText();
  }
  function syncText() { if (QP.ed) QP.ed.text = QP.ed.pts.map(q => q.join(', ')).join('\n'); }
  function startOpts(ed) {
    const towns = ['Talking Island', 'Gludin', 'Gludio', 'Dion', 'Giran', 'Oren', 'Aden', 'Hunters', 'Heine', 'Goddard', 'Rune', 'Schuttgart'];
    const o = ['<option value="">none (walk from where the bot stands / the computed way to point 1)</option>'].concat(towns.map(t => `<option value="town:${h(t)}"${QP.ed.start === 'town:' + t ? ' selected' : ''}>.${h(t.toLowerCase().replace(/ /g, ''))}</option>`));
    const ts = QP.ed.tStart; if (ts && ts.kind === 'gk') { const v = 'gk:' + ts.from + '|' + ts.desc; o.push(`<option value="${h(v)}"${QP.ed.start === v ? ' selected' : ''}>gatekeeper ${h(ts.desc)}</option>`); }
    if (QP.ed.start && !o.some(x => x.includes(`value="${h(QP.ed.start)}"`))) o.push(`<option value="${h(QP.ed.start)}" selected>${h(QP.ed.start)}</option>`);
    return o.join('');
  }
  function editorHtml(p) {
    const ed = QP.ed, st = p.steps[ed.i];
    const chars = (QP.d.live || []).concat(((typeof STATE !== 'undefined' && STATE && STATE.chars) || []).filter(c => c && c.name && isFinite(c.x)).map(c => ({ name: c.name, x: c.x, y: c.y, z: c.z }))).filter((c, k, A) => c.x != null && A.findIndex(x => x.name === c.name) === k);
    return `<div class="qpl-ed box" role="region" aria-label="override route editor"><h4>Override step ${ed.i + 1}: ${h(st.text || st.key)} <small class="muted">${h(st.key)}</small></h4>
      <div class="muted">Your route wins over the computed one: the leader takes the team to its start and every member walks each point (walls are checked between points). Tap the map to add points.</div>
      <label>Start <select data-qpl="ed-start">${startOpts(ed)}</select></label>
      <label class="qpl-pts">Route points (x, y, z — one per line)<textarea data-qpl="ed-pts" rows="6" spellcheck="false">${h(ed.text)}</textarea></label>
      <div class="qpl-btns"><button type="button" data-qpl="ed-comp"${ed.comp ? '' : ' disabled'}>Start from the computed route</button>
        <select data-qpl="ed-char"><option value="">add a character's position…</option>${chars.map(c => `<option value="${h(c.name)}">${h(c.name)}</option>`).join('')}</select>
        <button type="button" data-qpl="ed-undo">Remove last point</button><button type="button" data-qpl="ed-clr">Clear points</button></div>
      ${st.npc ? `<label>NPC stands at (x, y, z; empty = datapack ${st.npc.at ? h(st.npc.at.join(', ')) : 'none'})<input type="text" data-qpl="ed-npc" value="${h(ed.npcAt)}"></label>` : ''}
      ${st.kind === 'hunt' || st.kind === 'spawn' ? `<label>Hunt here instead (x, y, z)<input type="text" data-qpl="ed-area" value="${h(ed.area)}"></label><label>radius <input type="number" min="100" max="10000" data-qpl="ed-rad" value="${h(ed.radius)}"></label><label>name <input type="text" data-qpl="ed-aname" value="${h(ed.aname)}" maxlength="80"></label>` : ''}
      <label><input type="checkbox" data-qpl="ed-manual"${ed.manual ? ' checked' : ''}> manual: the bot stops before this step (I do it)</label>
      <label>Note <input type="text" data-qpl="ed-note" value="${h(ed.note)}" maxlength="300"></label>
      <div class="qpl-btns"><button type="button" class="on" data-qpl="ed-save">Save override</button><button type="button" data-qpl="ed-cancel">Cancel</button></div></div>`;
  }
  const parse3 = (s) => { const m = String(s || '').match(/-?\d+(\.\d+)?/g); return m && m.length >= 2 ? [Math.round(+m[0]), Math.round(+m[1]), Math.round(+(m[2] || 0))] : null; };
  async function edSave() {
    const ed = QP.ed; if (!ed || QP.busy) return;
    const pts = String(ed.text || '').split(/\n/).map(parse3).filter(Boolean);
    if (pts.length === 1) { QP.msg = 'a route needs at least 2 points'; render(); return; }
    const o = {}; if (pts.length) o.route = pts;
    if (ed.start) { if (ed.start.startsWith('town:')) o.start = { kind: 'town', town: ed.start.slice(5) }; else { const [from, desc] = ed.start.slice(3).split('|'); o.start = { kind: 'gk', from, desc }; } }
    if (ed.npcAt) { const p = parse3(ed.npcAt); if (!p) { QP.msg = 'NPC place: x, y, z'; render(); return; } o.npcAt = p; }
    if (ed.area) { const p = parse3(ed.area); if (!p) { QP.msg = 'hunting place: x, y, z'; render(); return; } o.area = { at: p, radius: Number(ed.radius) || 1500, name: ed.aname || 'my hunting place' }; }
    if (ed.manual) o.manual = true; if (ed.note) o.note = ed.note;
    QP.busy = true;
    let r; try { r = await get('/api/quests/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: QP.id, key: ed.key, override: Object.keys(o).length ? o : null, base: (planOf().override || {}).editedAt || undefined }) }); } catch (e) { r = { error: e.message }; }
    QP.busy = false;
    QP.msg = r && r.ok ? 'Saved — the bots use it at their next step.' : 'Not saved: ' + ((r && r.error) || '?');
    if (r && r.ok) QP.ed = null;
    await load();
  }
  async function post(body, okMsg) {
    let r; try { r = await get('/api/quests/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ id: QP.id }, body)) }); } catch (e) { r = { error: e.message }; }
    QP.msg = r && r.ok ? okMsg : 'Not saved: ' + ((r && r.error) || '?'); await load();
  }
  async function ask(t) { if (typeof uiConfirm === 'function') { try { return await uiConfirm(t); } catch (e) { return false; } } return true; }
  async function onClick(e) {
    const b = e.target.closest('[data-qpl]'); if (!b || !QP.el.contains(b)) return;
    const a = b.dataset.qpl, i = Number(b.dataset.i);
    if (a === 'sel' && e.target.closest('button,input,select,textarea,label')) return;
    if (a === 'sel') { QP.sel = QP.sel === i ? null : i; render(); return; }
    if (a === 'edit') { edOpen(i); render(); const x = QP.el.querySelector('.qpl-ed'); if (x) x.scrollIntoView({ block: 'nearest' }); return; }
    if (a === 'clear') { if (await ask('Remove your override of step ' + (i + 1) + '? The bots go back to the computed plan.')) post({ key: planOf().steps[i].key, override: null }, 'Override removed.'); return; }
    if (a === 'ed-cancel') { QP.ed = null; render(); return; }
    if (a === 'ed-save') { edSave(); return; }
    if (a === 'ed-undo' && QP.ed) { QP.ed.pts = String(QP.ed.text).split('\n').map(parse3).filter(Boolean); QP.ed.pts.pop(); syncText(); render(); return; }
    if (a === 'ed-clr' && QP.ed) { QP.ed.pts = []; syncText(); render(); return; }
    if (a === 'ed-comp' && QP.ed && QP.ed.comp) { QP.ed.pts = QP.ed.comp.map(q => q.slice()); if (!QP.ed.start && QP.ed.tStart) QP.ed.start = QP.ed.tStart.kind === 'town' ? 'town:' + QP.ed.tStart.town : 'gk:' + QP.ed.tStart.from + '|' + QP.ed.tStart.desc; syncText(); render(); return; }
    if (a === 'qsave') { const q = { skip: !!QP.el.querySelector('[data-qpl="qskip"]').checked, manual: !!QP.el.querySelector('[data-qpl="qmanual"]').checked, note: QP.el.querySelector('[data-qpl="qnote"]').value };
      if (q.skip && !(await ask('Skip this quest? The bots will not start it (circuits / farm skip it too).'))) return;
      post({ quest: q }, 'Saved.'); return; }
  }
  function onInput(e) {
    const t = e.target, a = t.dataset && t.dataset.qpl; if (!a || !QP.ed) return;
    const ed = QP.ed;
    if (a === 'ed-pts') { ed.text = t.value; ed.pts = t.value.split('\n').map(parse3).filter(Boolean); if (e.type === 'change') render(); return; }
    if (a === 'ed-start') ed.start = t.value; else if (a === 'ed-npc') ed.npcAt = t.value; else if (a === 'ed-area') ed.area = t.value; else if (a === 'ed-rad') ed.radius = t.value; else if (a === 'ed-aname') ed.aname = t.value;
    else if (a === 'ed-manual') ed.manual = t.checked; else if (a === 'ed-note') ed.note = t.value;
    else if (a === 'ed-char' && t.value) { const c = (QP.d.live || []).concat(((typeof STATE !== 'undefined' && STATE && STATE.chars) || [])).find(x => x && x.name === t.value && isFinite(x.x)); if (c) { ed.pts.push([Math.round(c.x), Math.round(c.y), Math.round(c.z || 0)]); syncText(); } t.value = ''; render(); }
  }
  window.QuestPlan = { mount, stop, _st: QP };
})();
