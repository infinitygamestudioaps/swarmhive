// CLASS ROTATIONS (CLASSROT-2026-10-26; owner: "Implement this line for line ... under /Combat"): shared by the compile tool
// (docs/plan/tools/class_rotation_compile.js), the dashboard API (classrot_api.js) and the page (combatclass.js).
// Source rows: Scripts/data/class_rotations/<group>.json (format docs/plan/class_skills/ROTATION_SCHEMA.md); the owner's ticks:
// Scripts/data/class_rotations_user.json { "<classId>": { "<aspect>:<skillId>": { "auto": true|false } } }.
// compileClass() = what ONE class id uses: its own rows + the rows of its parent classes (a later class's row for the same aspect+skill wins;
// a later "never" / "obsolete" row of a skill removes the older rows of that skill), the owner's ticks applied per class tier.
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.ClassRot = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const BANDS = ['1-19', '20-39', '40-75', '76-85'];
  const ASPECT_TEXT = {
    single: 'Single target', opener: 'Opener', aoe: 'Area (at the target)', 'aoe-self': 'Area (around me)', burst: 'Burst', debuff: 'Debuff', cc: 'Crowd control',
    toggle: 'Toggle', selfbuff: 'Self buff', partybuff: 'Party buff', heal: 'Heal', groupheal: 'Group heal', recharge: 'Recharge', cure: 'Cure', res: 'Resurrect',
    summon: 'Summon', pet: 'Pet', spoil: 'Spoil', sweep: 'Sweep', mp: 'MP', emergency: 'Emergency', never: 'Never', obsolete: 'Obsolete',
  };
  const ASPECT_ORDER = ['emergency', 'debuff', 'opener', 'burst', 'aoe', 'aoe-self', 'single', 'cc', 'heal', 'groupheal', 'recharge', 'cure', 'res', 'spoil', 'sweep', 'toggle', 'selfbuff', 'partybuff', 'mp', 'summon', 'pet', 'never', 'obsolete'];
  const WEAPON_TEXT = { SWORD: 'sword', BLUNT: 'blunt', '2H_SWORD': '2H sword', '2H_BLUNT': '2H blunt', DAGGER: 'dagger', DUALDAGGER: 'dual daggers', DUAL: 'dual swords', POLE: 'polearm',
    BOW: 'bow', CROSSBOW: 'crossbow', FIST: 'fists', RAPIER: 'rapier', ANCIENT: 'ancient sword', SHIELD: 'shield', NOT_BOW: 'not a bow' };
  /** "60-74" / "60" -> [60, 74] */
  function learnRange(s) { const m = /(\d+)(?:\s*-\s*(\d+))?/.exec(String(s || '')); return m ? [Number(m[1]), Number(m[2] || m[1])] : [0, 0]; }
  /** the plain-English text of a when object (what the page shows next to the guide's trigger text) */
  function whenText(w) {
    if (!w) return '';
    const o = [];
    const P = (k, t) => { if (w[k] != null && w[k] !== false) o.push(typeof t === 'function' ? t(w[k]) : t); };
    P('onCooldown', 'on cooldown'); P('mobsMin', v => `${v}+ monsters`); P('mobsMax', v => `at most ${v} monsters`);
    P('hpBelow', v => `my HP < ${v} %`); P('hpAbove', v => `my HP > ${v} %`); P('mpBelow', v => `my MP < ${v} %`); P('mpAbove', v => `my MP > ${v} %`); P('cpAbove', v => `my CP > ${v} %`);
    P('targetHpAbove', v => `target HP > ${v} %`); P('targetHpBelow', v => `target HP < ${v} %`); P('distMin', v => `target ${v}+ away`); P('distMax', v => `target within ${v}`);
    P('targetHas', v => `target has ${String(v).replace(/_/g, ' ')}`); P('targetLacks', v => `target lacks skill ${v}`); P('behind', 'from behind'); P('bigTarget', 'big targets only');
    P('raidOnly', 'raids only'); P('notRaid', 'not in raids'); P('soloOnly', 'solo only'); P('partyOnly', 'in a party'); P('fightOnly', 'in fights'); P('outOfCombat', 'out of combat'); P('always', 'always on');
    P('alliesBelow', v => `${v.n}+ members < ${v.pct} %`); P('allyBelow', v => `a member < ${v} %`); P('tankBelow', v => `tank < ${v} %`); P('mobsOnMe', v => `${v}+ monsters on me`);
    P('onTank', 'on the tank / its target'); P('boardMissing', v => `only without the board's ${v}`); P('item', v => `needs item ${v}`); P('corpse', 'needs a corpse');
    P('noSpoiler', 'no spoiler in the party'); P('summonOut', 'summon out'); P('noFrenzyWindow', 'not in the Frenzy window'); P('afterSkill', v => `after skill ${v}`);
    P('charges', v => `${v} charges`); P('souls', v => `${v} souls`); P('mobType', v => `vs ${Array.isArray(v) ? v.join('/') : v} (Hive cannot see the monster kind: not cast by itself)`);
    return o.join(' · ');
  }
  /** classesById: { cid: { classId, parent, tier, name } } built from class_skills.json lines */
  function classIndex(classSkills) {
    const idx = {};
    (classSkills.lines || []).forEach(l => l.tiers.forEach((t, i) => {
      const e = idx[t.classId] = idx[t.classId] || { classId: t.classId, name: t.name, tier: t.tier != null ? t.tier : i, parent: i > 0 ? l.tiers[i - 1].classId : null, lines: [], learn: {} };
      if (!e.lines.includes(l.name)) e.lines.push(l.name);
      t.skills.forEach(s => { e.learn[s.id] = s; });
    }));
    return idx;
  }
  function chainOf(idx, cid) { const out = []; let c = Number(cid); while (c != null && idx[c]) { out.unshift(c); c = idx[c].parent; } return out; }
  /** groups: [{ group, rules, classes }] ; user: the owner's ticks ; meta: { skillId: { scope, radius, range, power, mp, ab, dur, magic } } */
  function compileClass(cid, groups, idx, user, meta) {
    const chain = chainOf(idx, cid); if (!chain.length) return null;
    const src = {}; (groups || []).forEach(g => Object.keys(g.classes || {}).forEach(k => { src[k] = Object.assign({ group: g.group }, g.classes[k]); }));
    let rows = [], o = 0;
    chain.forEach((c, tier) => {
      const C = src[c]; if (!C) return;
      const U = (user && user[c]) || {};
      const mine = (idx[cid] && idx[cid].lines) || [];
      (C.rows || []).forEach(r => {
        const rl = Array.isArray(r.lines) && r.lines.length ? r.lines : (r.line ? [r.line] : null);   // 'lines' (dark elves) or 'line' (kamael)
        if (rl && !rl.some(l => mine.includes(l))) return;   // a shared base table row of another line
        const id = Number(r.skill), key = `${r.aspect}:${id}`;
        const lr = learnRange(r.learn || (idx[c].learn[id] ? `${idx[c].learn[id].from}-${idx[c].learn[id].to}` : ''));
        const auto = U[key] && typeof U[key].auto === 'boolean' ? U[key].auto : !!r.auto;
        const row = { a: r.aspect, id, n: r.name, w: r.weapon || [], when: r.when || {}, auto, def: !!r.auto, user: !!(U[key] && typeof U[key].auto === 'boolean'), tier, from: idx[c].name, cls: c, o: o++,
          max: lr[1], learn: r.learn || '', rb: (r.replacedBy || []).map(Number), trig: r.trigger || '', why: r.why || '', src: r.src || '', lines: Array.isArray(r.lines) && r.lines.length ? r.lines : (r.line ? [r.line] : null) };
        const condNever = r.when && Object.keys(r.when).length;
        if ((r.aspect === 'never' || r.aspect === 'obsolete') && !condNever) rows = rows.filter(x => x.id !== id || x.tier === tier);   // a later never / obsolete removes the older rows of that skill
        rows = rows.filter(x => !(x.a === r.aspect && x.id === id && x.tier < tier));   // same aspect + skill: the later class wins
        rows.push(row);
      });
    });
    const skills = {}; rows.forEach(r => { if (meta && meta[r.id]) skills[r.id] = meta[r.id]; });
    const me = idx[cid], C = src[cid] || {};
    return { cid: Number(cid), name: me.name, band: BANDS[me.tier] || '', tier: me.tier, lines: me.lines, chain, group: C.group || '', notes: C.notes || [], rows, skills };
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const isRow = (s) => /^\s*\|/.test(s);
  const isItem = (s) => /^\s*([-*]|\d+\.)\s+/.test(s);
  // minimal markdown: headings, tables (also indented), lists, paragraphs, hr; h2 = one collapsible <details>
  function mdToHtml(src) {
    const L = src.replace(/\r/g, '').split('\n'), out = [], para = []; let i = 0, open = false;
    const flush = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para.length = 0; } };
    while (i < L.length) {
      const l = L[i];
      if (/^#\s/.test(l)) { flush(); i++; continue; }                       // the file title is shown by the race header
      const m = /^(#{2,4})\s+(.*)$/.exec(l);
      if (m) {
        flush(); const n = m[1].length;
        if (n === 2) { if (open) out.push('</div></details>'); out.push(`<h3>${inline(m[2])}</h3>`); }
        else out.push(`<h${n + 1}>${inline(m[2])}</h${n + 1}>`);
        i++; continue;
      }
      if (isRow(l)) {
        flush(); const rows = []; while (i < L.length && isRow(L[i])) rows.push(L[i++].trim());
        const cells = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim());
        const head = cells(rows[0]), body = rows.slice(/^\|[\s:|-]+\|$/.test(rows[1] || '') ? 2 : 1);
        out.push('<div class="tw"><table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          body.map(r => '<tr>' + cells(r).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      if (isItem(l)) {
        flush(); const ol = /^\s*\d+\./.test(l), items = [];
        while (i < L.length && isItem(L[i])) { let it = L[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''); while (i < L.length && /^\s{2,}\S/.test(L[i]) && !isItem(L[i]) && !isRow(L[i])) it += ' ' + L[i++].trim(); items.push(it); }
        out.push((ol ? '<ol>' : '<ul>') + items.map(x => `<li>${inline(x)}</li>`).join('') + (ol ? '</ol>' : '</ul>'));
        continue;
      }
      if (/^---+\s*$/.test(l) || !l.trim()) { flush(); i++; continue; }
      para.push(l.trim()); i++;
    }
    flush(); if (open) out.push('</div></details>');
    return out.join('\n');
  }
  
  /** a research .md -> [{ title, body }] per '## ' section */
  function mdSections(src) {
    const out = []; let cur = null;
    String(src || '').replace(/\r/g, '').split('\n').forEach(l => { const m = /^##\s+(.*)$/.exec(l); if (m) { cur = { title: m[1].trim(), body: [] }; out.push(cur); } else if (cur) cur.body.push(l); });
    return out.map(x => ({ title: x.title, body: x.body.join('\n') }));
  }
  return { mdToHtml, mdSections, BANDS, ASPECT_TEXT, ASPECT_ORDER, WEAPON_TEXT, learnRange, whenText, classIndex, chainOf, compileClass };
});
