// COMBAT PROFILE page #/combat/<Name> (COMBATPROFILE-2026-10-17; owner: "I want to be able to setup combat profile inside hive exactly like
// swarm" + "Build it"). The character's own L2Swarm profile, edited here: Attacks (L2Swarm Combat Skills with their conditions), Heals & buffs
// (Auto Skills), Items (Auto Items), Follow & range, Pick up & more, Monsters. Save = the server logs the character out, writes the profile
// (backup kept, nothing else in the file changes) and logs it in again (Dashboard/combatprofile_api.js). Plus a "Combat profile" box on the
// character page. Rules + names: /combatxml.js (CombatXml). Uses index.html globals: api, iconUrl, stopChar, TAB; uidialog: uiConfirm, uiError, uiP, uiNote.
(function () {
  'use strict';
  const SEC = 'tab-combatprofile';
  const S = { open: false, name: '', d: null, orig: null, cur: null, tab: 'attacks', busy: false, poll: 0, msgT: 0, pick: null };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (p) => p ? (typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png') : '';
  const clone = (o) => JSON.parse(JSON.stringify(o == null ? null : o));
  const dirty = () => S.cur && S.orig && JSON.stringify(S.cur) !== JSON.stringify(S.orig);
  const E = () => (S.d && S.d.enums) || {};
  const TABS = [['attacks', 'Attacks'], ['auto', 'Heals & buffs'], ['items', 'Items'], ['follow', 'Follow & range'], ['more', 'Pick up & more'], ['mobs', 'Monsters']];

  // ============================================================================================ data
  async function load(keep) {
    if (!S.name) return;
    let d = null; try { d = await api('/api/combatprofile?char=' + encodeURIComponent(S.name)); } catch (e) { d = { error: e.message }; }
    if (!d || d.error) { S.d = null; flash((d && d.error) || 'The dashboard server has no combat profile API yet (it needs a restart).', true); render(); return; }
    S.d = d;
    if (!S.orig || !dirty()) { S.orig = clone(d.profile); S.cur = clone(d.profile); }   // a late / second load never throws away unsaved edits
    else if (d.rev !== S.rev) flash('L2Swarm saved this profile meanwhile. Your unsaved changes stay; Save puts them on top of the new file.', true);
    S.rev = d.rev;
    render();
    if (!S.scrolled) { S.scrolled = true; toTop(); }
    if (d.job && !d.job.done) startPoll();
  }
  function startPoll() {
    clearInterval(S.poll);
    S.poll = setInterval(async () => {
      if (!S.open) { clearInterval(S.poll); return; }
      let d = null; try { d = await api('/api/combatprofile?char=' + encodeURIComponent(S.name)); } catch (e) { return; }
      if (!d || d.error) return;
      S.d.job = d.job; renderJob();
      if (!d.job || d.job.done) { clearInterval(S.poll); S.busy = false; if (d.job && d.job.ok) { S.d = d; S.orig = clone(d.profile); S.cur = clone(d.profile); render(); if (window.UIKit) UIKit.toast(`${S.name}: combat profile saved in L2Swarm`, { kind: 'ok' }); } else renderBar(); }
    }, 1500);
  }

  // ============================================================================================ frame + routing
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win cpf'; s.hidden = true;
    s.innerHTML = `<div class="cpf-head"><h2><img class="gi" src="${ico('icon/action003')}" alt=""> Combat profile <span id="cpfWho"></span></h2><a class="cpf-back" id="cpfBack" href="#">← character</a></div>
      <div class="cpf-msg" id="cpfMsg" role="status" hidden></div>
      <div class="cpf-tabs" id="cpfTabs" role="tablist"></div>
      <div id="cpfBody"></div><div id="cpfJob"></div>
      <div class="cpf-bar" id="cpfBar" hidden></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('change', onChange);
    s.addEventListener('input', onInput);
    return s;
  }
  function route(kind, arg) {
    if (kind === 'combat') { open(arg ? decodeURIComponent(arg) : ''); return true; }
    close(); return false;
  }
  function open(name) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'combat'; } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    if (S.name !== name) { S.name = name; S.d = null; S.orig = S.cur = null; S.tab = 'attacks'; }
    s.hidden = false; S.open = true;
    S.scrolled = false; toTop();   // phones: the page starts below the header + tab buttons
    render(); load(false);
  }
  /** phones: the page starts below the header + tab buttons -> bring it to the top once it has content */
  function toTop() { [0, 200].forEach(ms => setTimeout(() => { try { const s = $id(SEC); if (S.open && s && s.getBoundingClientRect().top > 40) s.scrollIntoView({ block: 'start' }); } catch (e) { } }, ms)); }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); const s = $id(SEC); if (s) s.hidden = true; }
  function flash(t, bad) {
    const m = $id('cpfMsg'); if (!m) return;
    m.hidden = !t; m.className = 'cpf-msg' + (bad ? ' bad' : ''); m.textContent = t || '';
    clearTimeout(S.msgT); S.msgT = setTimeout(() => { const x = $id('cpfMsg'); if (x) x.hidden = true; }, bad ? 15000 : 7000);
  }

  // ============================================================================================ small widgets
  const tog = (on, attrs, label) => `<button type="button" class="cpf-tog${on ? ' on' : ''}" aria-pressed="${!!on}" ${attrs}>${on ? 'On' : 'Off'}</button>${label ? ` <span>${h(label)}</span>` : ''}`;
  const num = (v, attrs, w) => `<input type="number" inputmode="numeric" class="cpf-num" style="width:${w || 74}px" value="${h(v)}" ${attrs}>`;
  const sel = (v, opts, attrs) => `<select ${attrs}>${opts.map(o => { const [val, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${h(val)}"${String(val) === String(v) ? ' selected' : ''}>${h(t)}</option>`; }).join('')}</select>`;
  const skillIcon = (id) => { const k = ((S.d && S.d.known) || []).find(x => x.id === Number(id)); return k && k.icon ? `<img class="cpf-ic" src="${ico(k.icon)}" alt="">` : '<span class="cpf-ic cpf-noic"></span>'; };
  const knownName = (id) => { const k = ((S.d && S.d.known) || []).find(x => x.id === Number(id)); return k ? `${k.name} (lv ${k.lvl})` : ''; };
  const moveBtns = (list, i) => `<div class="cpf-mv"><button type="button" data-cpfmv="${list}|${i}|-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button><button type="button" data-cpfmv="${list}|${i}|1" aria-label="Move down">▼</button><button type="button" data-cpfdel="${list}|${i}" aria-label="Remove">✕</button></div>`;
  function condText(c) { const T = (E().triggerText || {})[c.trigger] || [c.trigger, '']; return T[0] + (T[1] ? ` ${c.value} ${T[1] === '%' ? '%' : T[1]}` : '') + (T[2] && c.distance ? ` within ${c.distance}` : ''); }
  function groupsHtml(path, groups) {
    const T = E().triggerText || {}, trig = (E().triggers || []).map(t => [t, (T[t] || [t])[0]]);
    const g = groups && groups.length ? groups : [];
    return `<div class="cpf-conds">${g.map((grp, gi) => `${gi ? '<div class="cpf-or">or</div>' : ''}<div class="cpf-grp">${grp.map((c, ci) => { const t = T[c.trigger] || [c.trigger, '']; return `${ci ? '<div class="cpf-and">and</div>' : ''}
      <div class="cpf-cond">${sel(c.trigger, trig, `data-cpfc="${path}|${gi}|${ci}|trigger" aria-label="Condition"`)}${t[1] ? num(c.value, `data-cpfc="${path}|${gi}|${ci}|value" aria-label="Value"`) + `<span class="muted">${h(t[1])}</span>` : ''}${t[2] ? ` <span class="muted">within</span> ${num(c.distance, `data-cpfc="${path}|${gi}|${ci}|distance" aria-label="Distance"`)}` : ''}
      <button type="button" class="cpf-x" data-cpfcdel="${path}|${gi}|${ci}" aria-label="Remove this condition">×</button></div>`; }).join('')}
      <button type="button" class="cpf-add2" data-cpfcadd="${path}|${gi}">+ and</button></div>`).join('')}
      <button type="button" class="cpf-add2" data-cpfgadd="${path}">${g.length ? '+ or (another set)' : '+ add a condition'}</button></div>`;
  }

  // ============================================================================================ render
  function render() {
    const s = section(); if (!S.open) return;
    const d = S.d;
    $id('cpfWho').innerHTML = S.name ? `· ${h(S.name)}${d ? ` <span class="muted">lvl ${h(d.level || '?')} ${h(d.cls || '')}${d.online ? '' : ' · offline'}</span>` : ''}` : '';
    $id('cpfBack').href = '#/char/' + encodeURIComponent(S.name);
    $id('cpfTabs').innerHTML = TABS.map(([k, t]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? 'on' : ''}" data-cpftab="${k}">${t}${k === 'attacks' && S.cur ? ` <b>${S.cur.combatSkills.length}</b>` : k === 'auto' && S.cur ? ` <b>${S.cur.autoSkills.length}</b>` : k === 'items' && S.cur ? ` <b>${S.cur.autoItems.length}</b>` : ''}</button>`).join('');
    if (!S.name) { $id('cpfBody').innerHTML = '<div class="muted">Open it from a character page.</div>'; return; }
    if (!d || !S.cur) { $id('cpfBody').innerHTML = '<div class="muted">Loading…</div>'; renderBar(); return; }
    const P = S.cur;
    let body = '';
    if (S.tab === 'attacks') {
      body = `<p class="cpf-help">What L2Swarm casts while this character fights, <b>top first</b>: the first skill whose conditions are true and that is ready. Nothing here = plain hits. ` +
        `With <b>Hive picks my skills</b> switched ON the Hive casts its own choice and these stay off.</p>` +
        P.combatSkills.map((c, i) => `<div class="cpf-card${c.enabled ? '' : ' off'}"><div class="cpf-row">${skillIcon(c.id)}<div class="cpf-name"><b>${h(c.name || 'choose a skill')}</b><span class="muted">${h(knownName(c.id) ? '' : c.id ? 'not learned now' : '')}</span></div>${tog(c.enabled, `data-cpft="combatSkills|${i}|enabled"`)}${moveBtns('combatSkills', i)}</div>
          <div class="cpf-row cpf-opts"><label>${tog(c.repeat, `data-cpft="combatSkills|${i}|repeat"`, 'cast again and again')}</label><label>wait ${num(c.repeatDelay, `data-cpfn="combatSkills|${i}|repeatDelay"`, 60)} s between casts</label><button type="button" class="cpf-link" data-cpfpick="combatSkills|${i}">change skill</button></div>
          <div class="cpf-lab">Cast when</div>${groupsHtml('combatSkills|' + i, c.groups)}</div>`).join('') +
        `<button type="button" class="cpf-add" data-cpfpick="combatSkills|new">+ Add an attack skill</button>`;
    } else if (S.tab === 'auto') {
      const kinds = (E().autoSkillTypes || []).map(t => [t, (E().autoSkillText || {})[t] || t]);
      body = `<p class="cpf-help">L2Swarm's Auto Skills: heals, buffs, cleanses and resurrection it uses by itself. With <b>Hive heals</b> ON the Hive heals instead.</p>` +
        P.autoSkills.map((a, i) => { const F = (E().autoFields || {})[a.type] || []; return `<div class="cpf-card${a.enabled ? '' : ' off'}"><div class="cpf-row">${skillIcon(a.id)}<div class="cpf-name"><b>${h(a.name || (a.id ? 'skill ' + a.id : 'no skill'))}</b>${sel(a.type, kinds, `data-cpfs="autoSkills|${i}|type" aria-label="Kind"`)}</div>${tog(a.enabled, `data-cpft="autoSkills|${i}|enabled"`)}${moveBtns('autoSkills', i)}</div>
          <div class="cpf-row cpf-opts">${F.includes('Percents') ? `<label>when ${sel(a.healType || 'HP', E().healTypes || [], `data-cpfs="autoSkills|${i}|healType"`)} is below ${num(a.percents == null ? 50 : a.percents, `data-cpfn="autoSkills|${i}|percents"`)} %</label>` : ''}
            ${F.includes('CountMembers') ? `<label>and at least ${num(a.countMembers == null ? 3 : a.countMembers, `data-cpfn="autoSkills|${i}|countMembers"`, 60)} members are low</label>` : ''}
            ${F.includes('MinMpPercent') ? `<label>only with MP above ${num(a.minMp || 0, `data-cpfn="autoSkills|${i}|minMp"`, 60)} %</label>` : ''}
            ${F.includes('Delay') ? `<label>every ${num(a.delay || 0, `data-cpfn="autoSkills|${i}|delay"`, 80)} s</label>` : ''}
            ${F.includes('IsAuto') ? `<label>${tog(!!a.isAuto, `data-cpft="autoSkills|${i}|isAuto"`, 'when the buff runs out (auto)')}</label>` : ''}
            <button type="button" class="cpf-link" data-cpfpick="autoSkills|${i}">change skill</button></div>
          ${F.includes('NameList') ? namesHtml(i, a.names || []) : ''}</div>`; }).join('') +
        `<button type="button" class="cpf-add" data-cpfpick="autoSkills|new">+ Add a heal / buff / cleanse / resurrect</button>`;
    } else if (S.tab === 'items') {
      body = `<p class="cpf-help">Items L2Swarm uses by itself (potions at a % line). Your bag now: ${(d.bag || []).filter(b => /potion|elixir|herb|scroll/i.test(b.name)).slice(0, 8).map(b => h(b.name) + ' ×' + h(b.n)).join(', ') || 'no potions'}.</p>` +
        P.autoItems.map((a, i) => `<div class="cpf-card${a.enabled ? '' : ' off'}"><div class="cpf-row"><div class="cpf-name"><b>${h(a.type === 'SelfDPRecover' ? 'Recover the death penalty' : (a.name || 'choose an item'))}</b></div>${tog(a.enabled, `data-cpft="autoItems|${i}|enabled"`)}${moveBtns('autoItems', i)}</div>
          ${a.type === 'SelfDPRecover' ? '' : `<div class="cpf-row cpf-opts"><label>when ${sel(a.healType || 'HP', E().healTypes || [], `data-cpfs="autoItems|${i}|healType"`)} is below ${num(a.percents == null ? 50 : a.percents, `data-cpfn="autoItems|${i}|percents"`)} %</label>
            <label>${tog(!!a.useTimer, `data-cpft="autoItems|${i}|useTimer"`, 'also every')} ${num(a.delay || 0, `data-cpfn="autoItems|${i}|delay"`, 70)} s</label><button type="button" class="cpf-link" data-cpfpick="autoItems|${i}">change item</button></div>`}</div>`).join('') +
        `<div class="cpf-row"><button type="button" class="cpf-add" data-cpfpick="autoItems|new">+ Add an item</button>${P.autoItems.some(a => a.type === 'SelfDPRecover') ? '' : '<button type="button" class="cpf-add" data-cpfdp="1">+ Recover the death penalty</button>'}</div>`;
    } else if (S.tab === 'follow') body = scalarsHtml(['follow', 'range']);
    else if (S.tab === 'more') body = scalarsHtml(['pickup', 'shots', 'res', 'pet']) + `<div class="cpf-card"><div class="cpf-lab">Shots L2Swarm uses</div><div class="cpf-row">${(P.shots || []).map((x, i) => `<span class="chip">${h(x)} <button type="button" class="cpf-x" data-cpfshotdel="${i}" aria-label="Remove">×</button></span>`).join(' ') || '<span class="muted">none</span>'}</div>
        <div class="cpf-row"><input id="cpfShotNew" placeholder="e.g. SSD, BSSC" style="width:140px"><button type="button" class="cpf-add2" data-cpfshotadd="1">+ add</button></div></div>`;
    else if (S.tab === 'mobs') body = `<p class="cpf-help">Monsters with their own rule: never attack (Treasure Chests …) or spoil.</p><div class="cpf-card">${(P.mobs || []).map((m, i) => `<div class="cpf-row cpf-mob"><b>${h(m.name || 'monster')}</b> <span class="muted">#${h(m.id)}</span>
        <label>${tog(m.attack, `data-cpft="mobs|${i}|attack"`, 'attack')}</label><label>${tog(m.spoil, `data-cpft="mobs|${i}|spoil"`, 'spoil')}</label><button type="button" class="cpf-x" data-cpfdel="mobs|${i}" aria-label="Remove">✕</button></div>`).join('') || '<div class="muted">none</div>'}
        <div class="cpf-row"><input id="cpfMobId" type="number" placeholder="monster id" style="width:110px"><input id="cpfMobName" placeholder="name" style="width:160px"><button type="button" class="cpf-add2" data-cpfmobadd="1">+ add (never attack)</button></div></div>`;
    $id('cpfBody').innerHTML = body + (S.pick ? pickerHtml() : '');
    renderJob(); renderBar();
  }
  function namesHtml(i, names) {
    const all = [...new Set((names || []).map(n => n.name).concat((S.d && S.d.partyNames) || []))];
    const on = (n) => (names || []).some(x => x.name === n && x.on);
    return `<div class="cpf-lab">For</div><div class="cpf-names">${all.map(n => `<label class="cpf-nm"><input type="checkbox" data-cpfname="${i}|${h(n)}"${on(n) ? ' checked' : ''}> ${h(n)}</label>`).join('')}</div>`;
  }
  function scalarsHtml(groups) {
    const sc = S.cur.scalars || {};
    const G = { follow: 'Follow & assist', range: 'Where it fights', pickup: 'Pick up', shots: 'Shots', res: 'Resurrection', pet: 'Pet' };
    return groups.map(g => { const rows = (E().scalars || []).filter(x => x[3] === g && sc[x[0]] !== undefined); if (!rows.length) return ''; return `<div class="cpf-card"><div class="cpf-lab">${h(G[g])}</div>${rows.map(([k, kind, label]) => {
      const v = sc[k];
      const ctl = kind === 'bool' ? tog(v, `data-cpfsc="${k}|bool"`) : kind === 'int' ? num(v, `data-cpfsc="${k}|int"`, 90) : kind.startsWith('enum:') ? sel(v, kind.slice(5).split('|'), `data-cpfsc="${k}|text"`)
        : kind.startsWith('numenum:') ? sel(v, kind.slice(8).split('|').map((t, i) => [String(i), t]), `data-cpfsc="${k}|text"`)
        : k === 'FollowName' ? sel(v, [''].concat((S.d.partyNames || []).filter(n => n !== S.name)).concat(v && !(S.d.partyNames || []).includes(v) ? [v] : []), `data-cpfsc="${k}|text"`) : `<input value="${h(v)}" data-cpfsc="${k}|text" style="min-width:160px">`;
      return `<div class="cpf-row cpf-sc"><span>${h(label)}</span>${ctl}</div>`; }).join('')}</div>`; }).join('') || '<div class="muted">Nothing to set here in this profile.</div>';
  }
  function pickerHtml() {
    const [list, idx] = S.pick.split('|'), isItem = list === 'autoItems';
    const q = (S.pickQ || '').toLowerCase();
    const src = isItem ? ((S.d && S.d.bag) || []).map(b => ({ id: b.id, name: b.name, sub: '×' + b.n, icon: b.icon }))
      : ((S.d && S.d.known) || []).filter(k => !k.toggle || list !== 'combatSkills').map(k => ({ id: k.id, name: k.name, sub: `lv ${k.lvl} · ${k.mp} MP${k.toggle ? ' · toggle' : ''}`, icon: k.icon, mp: k.mp, op: k.op }));
    const rows = src.filter(x => !q || x.name.toLowerCase().includes(q)).slice(0, 80);
    return `<div class="cpf-pick" role="dialog" aria-label="Choose"><div class="cpf-row"><b>${isItem ? 'Choose an item from the bag' : 'Choose one of ' + h(S.name) + '’s skills'}</b><button type="button" class="cpf-x" data-cpfpickclose="1" aria-label="Close">×</button></div>
      <input type="search" id="cpfPickQ" placeholder="Search…" value="${h(S.pickQ || '')}">
      <div class="cpf-picklist">${rows.map(x => `<button type="button" class="cpf-opt" data-cpfpickid="${x.id}">${x.icon ? `<img class="cpf-ic" src="${ico(x.icon)}" alt="">` : ''}<b>${h(x.name)}</b><span class="muted">${h(x.sub)}</span></button>`).join('') || '<div class="muted">Nothing found (the character must be online to list its skills).</div>'}</div>
      ${isItem ? '' : `<div class="cpf-row"><span class="muted">Not in the list?</span><input id="cpfPickId" type="number" placeholder="skill id" style="width:100px"><button type="button" class="cpf-add2" data-cpfpickbyid="1">use this id</button></div>`}</div>`;
  }
  function renderJob() {
    const el = $id('cpfJob'); if (!el) return; const J = S.d && S.d.job;
    if (!J) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="cpf-card cpf-job${J.done ? (J.ok ? ' ok' : ' bad') : ''}"><div class="cpf-row"><b>${J.done ? (J.ok ? '✓ Saved in L2Swarm' : '✗ Not saved') : 'Saving…'}</b>${J.done ? '<button type="button" class="cpf-link" data-cpfjobclose="1">hide</button>' : ''}</div>
      <ol class="cpf-steps">${(J.steps || []).map(t => `<li>${h(t)}</li>`).join('')}</ol></div>`;
  }
  function renderBar() {
    const b = $id('cpfBar'); if (!b) return;
    const busy = S.busy || (S.d && S.d.job && !S.d.job.done);
    b.hidden = !(dirty() || busy);
    b.innerHTML = `<span>${busy ? 'Saving in L2Swarm…' : 'Unsaved changes'}</span><button type="button" data-cpfundo="1" ${busy ? 'disabled' : ''}>Undo</button><button type="button" class="primary" data-cpfsave="1" ${busy ? 'disabled' : ''}>Save to L2Swarm</button>`;
  }

  // ============================================================================================ edits
  const at = (list, i) => S.cur[list][Number(i)];
  function onClick(e) {
    const t = e.target, g = (s) => t.closest(s); let b;
    if ((b = g('[data-cpftab]'))) { S.tab = b.dataset.cpftab; S.pick = null; render(); return; }
    if ((b = g('[data-cpft]'))) { const [l, i, f] = b.dataset.cpft.split('|'); const o = at(l, i); o[f] = !o[f]; render(); return; }
    if ((b = g('[data-cpfsc]'))) { const [k, kind] = b.dataset.cpfsc.split('|'); if (kind === 'bool') { S.cur.scalars[k] = !S.cur.scalars[k]; render(); } return; }
    if ((b = g('[data-cpfmv]'))) { const [l, i, d] = b.dataset.cpfmv.split('|'), a = S.cur[l], j = Number(i) + Number(d); if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; render(); return; }
    if ((b = g('[data-cpfdel]'))) { const [l, i] = b.dataset.cpfdel.split('|'); S.cur[l].splice(Number(i), 1); render(); return; }
    if ((b = g('[data-cpfcdel]'))) { const [l, i, gi, ci] = b.dataset.cpfcdel.split('|'); const G = at(l, i).groups; G[gi].splice(Number(ci), 1); if (!G[gi].length) G.splice(Number(gi), 1); render(); return; }
    if ((b = g('[data-cpfcadd]'))) { const [l, i, gi] = b.dataset.cpfcadd.split('|'); at(l, i).groups[gi].push({ trigger: 'MpPercentMore', value: 10, distance: 0 }); render(); return; }
    if ((b = g('[data-cpfgadd]'))) { const [l, i] = b.dataset.cpfgadd.split('|'); const o = at(l, i); o.groups = o.groups || []; o.groups.push([{ trigger: o.groups.length ? 'Always' : 'TargetAlive', value: 0, distance: 0 }]); render(); return; }
    if ((b = g('[data-cpfpick]'))) { S.pick = b.dataset.cpfpick; S.pickQ = ''; render(); setTimeout(() => { const q = $id('cpfPickQ'); if (q) q.focus(); }, 30); return; }
    if (g('[data-cpfpickclose]')) { S.pick = null; render(); return; }
    if ((b = g('[data-cpfpickid]')) || g('[data-cpfpickbyid]')) {
      const id = b ? Number(b.dataset.cpfpickid) : Number(($id('cpfPickId') || {}).value); if (!(id > 0)) return;
      const [l, i] = S.pick.split('|'), isItem = l === 'autoItems';
      const k = isItem ? ((S.d.bag || []).find(x => x.id === id) || { id, name: 'item ' + id }) : ((S.d.known || []).find(x => x.id === id) || { id, name: 'skill ' + id, mp: 0 });
      if (i === 'new') {
        if (l === 'combatSkills') S.cur.combatSkills.push({ id, name: k.name, needTarget: true, mp: k.mp || 0, range: 0, enabled: true, repeat: true, repeatDelay: 0, groups: [[{ trigger: 'TargetAlive', value: 0, distance: 0 }]] });
        else if (l === 'autoSkills') { const heal = /heal|recover|vitalize/i.test(k.name), res = /resurrect|restoration|salvation/i.test(k.name), group = /group|major|greater group|balance/i.test(k.name);
          const type = res ? 'SkillResurrect' : heal && group ? 'MassHeal' : heal ? 'PartyHeal' : /cleanse|purify|remedy|cure/i.test(k.name) ? 'PartyDispel' : 'SelfBuff';
          S.cur.autoSkills.push({ type, id, name: k.name, needTarget: type !== 'SelfBuff' && type !== 'MassHeal', mp: k.mp || 0, enabled: true, names: (S.d.partyNames || []).map(n => ({ name: n, on: true })), healType: 'HP', percents: 60, countMembers: 3, delay: 0, minMp: 0, isAuto: true }); }
        else S.cur.autoItems.push({ type: 'SelfItemHeal', id, name: k.name, enabled: true, percents: /mana/i.test(k.name) ? 30 : 50, healType: /mana/i.test(k.name) ? 'MP' : 'HP', delay: 0, useTimer: false });
      } else { const o = at(l, i); o.id = id; o.name = k.name; if (k.mp != null) o.mp = k.mp; }
      S.pick = null; render(); return;
    }
    if (g('[data-cpfdp]')) { S.cur.autoItems.push({ type: 'SelfDPRecover', id: 0, name: '', enabled: true }); render(); return; }
    if (g('[data-cpfmobadd]')) { const id = Number(($id('cpfMobId') || {}).value), name = String(($id('cpfMobName') || {}).value || '').trim(); if (!(id > 0)) { flash('Type the monster id.', true); return; } S.cur.mobs.push({ id, name: name || 'monster ' + id, attack: false, spoil: false }); render(); return; }
    if ((b = g('[data-cpfshotdel]'))) { S.cur.shots.splice(Number(b.dataset.cpfshotdel), 1); render(); return; }
    if (g('[data-cpfshotadd]')) { String(($id('cpfShotNew') || {}).value || '').split(/[,\s]+/).filter(Boolean).forEach(x => { if (!S.cur.shots.includes(x)) S.cur.shots.push(x); }); render(); return; }
    if (g('[data-cpfjobclose]')) { api('/api/combatprofile', { method: 'POST', body: JSON.stringify({ action: 'cancel', char: S.name }) }).catch(() => { }); S.d.job = null; renderJob(); return; }
    if (g('[data-cpfundo]')) { S.cur = clone(S.orig); render(); return; }
    if (g('[data-cpfsave]')) { save(false); return; }
  }
  function onChange(e) {
    const t = e.target; let v;
    if ((v = t.dataset.cpfc)) { const [l, i, gi, ci, f] = v.split('|'); const c = at(l, i).groups[gi][ci]; c[f] = f === 'trigger' ? t.value : Number(t.value); if (f === 'trigger') render(); else renderBar(); return; }
    if ((v = t.dataset.cpfs)) { const [l, i, f] = v.split('|'); at(l, i)[f] = t.value; render(); return; }
    if ((v = t.dataset.cpfsc)) { const [k, kind] = v.split('|'); S.cur.scalars[k] = kind === 'int' ? Number(t.value) : t.value; renderBar(); return; }
    if ((v = t.dataset.cpfname)) { const [i, n] = v.split('|'); const o = S.cur.autoSkills[Number(i)]; o.names = o.names || []; let x = o.names.find(y => y.name === n); if (!x) { x = { name: n, on: false }; o.names.push(x); } x.on = t.checked; renderBar(); return; }
  }
  function onInput(e) {
    const t = e.target; let v;
    if ((v = t.dataset.cpfn)) { const [l, i, f] = v.split('|'); at(l, i)[f] = Number(t.value); renderBar(); return; }
    if (t.id === 'cpfPickQ') { S.pickQ = t.value; const pos = t.selectionStart; render(); const q = $id('cpfPickQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) { } } return; }
    if (t.dataset.cpfc || t.dataset.cpfsc) onChange(e);
  }
  async function save(force) {
    if (S.busy) return;
    const d = S.d; if (!d) return;
    if (!force) {
      const ok = await uiConfirm({ title: `Save ${S.name}'s combat profile in L2Swarm?`, body: [uiP(d.online ? `${S.name} logs out, the profile is written, and ${S.name} logs in again — about 30 seconds. Its party waits for it.` : `${S.name} is offline: the profile file is written now and used at the next login.`),
        uiNote('A copy of the old profile is kept. Nothing else in the file changes.')], confirmText: 'Save to L2Swarm' });
      if (!ok) return;
    }
    S.busy = true; renderBar();
    let r = null; try { r = await api('/api/combatprofile', { method: 'POST', body: JSON.stringify({ action: 'apply', char: S.name, profile: S.cur, rev: d.rev, force: !!force }) }); } catch (e) { r = { error: e.message }; }
    if (r && r.error) {
      S.busy = false; renderBar();
      if (r.canForce) { const go = await uiConfirm({ title: 'Save anyway?', body: [uiP(r.error)], confirmText: 'Save anyway', danger: true }); if (go) save(true); return; }
      uiError(r.errors && r.errors.length > 1 ? r.errors.join('\n') : r.error, 'Not saved'); return;
    }
    S.d.job = r.job; renderJob(); startPoll();
  }

  // ============================================================================================ character page box (#/char/<Name>)
  const charName = () => { const m = /^#\/char\/([^/]+)/.exec(location.hash); return m ? decodeURIComponent(m[1]) : ''; };
  const CB = { name: '', at: 0, d: null, busy: false };
  async function charBox() {
    const name = charName(); if (!name) return;
    const orders = document.querySelector('.cp-orders'); if (!orders || !orders.offsetParent) return;
    let b = $id('cpfCharBox');
    if (!b || b.parentElement !== orders.parentElement) { if (b) b.remove(); b = document.createElement('div'); b.id = 'cpfCharBox'; b.className = 'box cp-box cpf-cbox'; orders.parentElement.insertBefore(b, orders); }
    if (CB.busy) return;
    if (CB.name !== name || Date.now() - CB.at > 60000) { CB.busy = true; try { const d = await api('/api/combatprofile?char=' + encodeURIComponent(name)); CB.d = d && !d.error ? d : null; } catch (e) { CB.d = null; } CB.name = name; CB.at = Date.now(); CB.busy = false; }
    const d = CB.d, P = d && d.profile;
    const html = !P ? `<h3><img class="gi" src="${ico('icon/action003')}" alt=""><span>Combat profile</span><a style="margin-left:auto" href="#/combat/${encodeURIComponent(name)}">open →</a></h3><div class="muted">L2Swarm's own profile of ${h(name)} (needs the dashboard server restarted if it does not load).</div>`
      : `<h3><img class="gi" src="${ico('icon/action003')}" alt=""><span>Combat profile</span><a style="margin-left:auto" href="#/combat/${encodeURIComponent(name)}">edit →</a></h3>
        <div class="muted">L2Swarm: ${P.combatSkills.filter(s => s.enabled).length} attack skill(s) on, ${P.autoSkills.filter(s => s.enabled).length} heal / buff skill(s), ${P.autoItems.filter(s => s.enabled).length} item(s)${P.scalars.FollowAtk ? ', assists' + (P.scalars.FollowName ? ' ' + h(P.scalars.FollowName) : '') : ''}${P.scalars.CombatRange ? ', range ' + h(P.scalars.CombatRange) : ''}.</div>
        <div class="cpf-mini">${P.combatSkills.filter(s => s.enabled).slice(0, 6).map(s => `<span class="chip">${h(s.name)}</span>`).join(' ')}</div>`;
    if (b.__html !== html) { b.innerHTML = html; b.__html = html; }
  }
  setInterval(() => { if (charName() && !document.hidden) charBox().catch(() => { }); }, 4000);
  window.addEventListener('hashchange', () => setTimeout(() => charBox().catch(() => { }), 800));

  window.CombatProfilePage = { route, open, close, _state: S };
})();
