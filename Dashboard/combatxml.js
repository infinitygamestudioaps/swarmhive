// COMBAT PROFILE XML (COMBATPROFILE-2026-10-17; owner: "Ideally there should not be any difference, I want to be able to setup combat profile
// inside hive exactly like swarm" + "Build it"). Reads / writes the L2Swarm profile parts of a character's Settings/<file>.xml:
// CombatSkillsList, AutoSkillsList, AutoItemsList, MobSettingsList, EnabledShots and the combat scalars (follow, range, pickup, res ...).
// A small generic XML tree keeps every element we do not edit exactly as it was (unknown fields, Password, paths ...): only the blocks that
// changed are re-printed; everything else stays byte-identical (test_combat_profile.js checks the round trip on every Settings/*.xml).
// The model (what the dashboard edits) is plain JSON; L2Swarm's names: AdvCombatTypes / AutoSkillTypes / AutoItemTypes (L2Swarm.Core.dll).
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.CombatXml = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // ---- L2Swarm enums (read from L2Swarm.Core.dll by reflection, 2026-10-17) ----
  const TRIGGERS = ['HpSelfLess', 'HpSelfMore', 'MpPercentLess', 'MpPercentMore', 'CpPercentLess', 'CpPercentMore', 'SurroundedLess', 'Surrounded', 'ChargeLess', 'ChargeMore',
    'SoulsLess', 'SoulsMore', 'HpTargetLess', 'HpTargetMore', 'HpPercentTargetLess', 'HpPercentTargetMore', 'TargetSurroundedLess', 'TargetSurroundedMore', 'DistanceLess', 'DistanceMore',
    'SelfHasBuff', 'SelfLacksBuff', 'TargetHasBuff', 'TargetLacksBuff', 'TargetDead', 'Always', 'MpPercentAtLeast', 'TargetAlive', 'TargetSpoiled', 'TargetSweepable'];
  // plain words for the page: [text, unit of the value ('' = no value), uses the distance field]
  const TRIGGER_TEXT = {
    HpSelfLess: ['my HP is below', '%'], HpSelfMore: ['my HP is above', '%'], MpPercentLess: ['my MP is below', '%'], MpPercentMore: ['my MP is above', '%'], MpPercentAtLeast: ['my MP is at least', '%'],
    CpPercentLess: ['my CP is below', '%'], CpPercentMore: ['my CP is above', '%'], SurroundedLess: ['fewer monsters near me than', 'monsters', true], Surrounded: ['at least this many monsters near me', 'monsters', true],
    ChargeLess: ['my charges are below', 'charges'], ChargeMore: ['my charges are above', 'charges'], SoulsLess: ['my souls are below', 'souls'], SoulsMore: ['my souls are above', 'souls'],
    HpTargetLess: ['target HP below', 'HP'], HpTargetMore: ['target HP above', 'HP'], HpPercentTargetLess: ['target HP below', '%'], HpPercentTargetMore: ['target HP above', '%'],
    TargetSurroundedLess: ['fewer monsters near the target than', 'monsters', true], TargetSurroundedMore: ['more monsters near the target than', 'monsters', true],
    DistanceLess: ['target closer than', 'range'], DistanceMore: ['target farther than', 'range'], SelfHasBuff: ['I have the effect of skill', 'skill id'], SelfLacksBuff: ['I lack the effect of skill', 'skill id'],
    TargetHasBuff: ['target has the effect of skill', 'skill id'], TargetLacksBuff: ['target lacks the effect of skill', 'skill id'], TargetDead: ['target is dead', ''], Always: ['always', ''],
    TargetAlive: ['target is alive', ''], TargetSpoiled: ['target is spoiled', ''], TargetSweepable: ['target can be swept', ''],
  };
  const AUTOSKILL_TYPES = ['SelfSkillHeal', 'SelfBuff', 'SelfDispel', 'PartyHeal', 'PartyBuff', 'PartyDispel', 'MassHeal', 'SkillResurrect', 'PetHeal', 'PetBuff', 'PetResurrect'];
  const AUTOSKILL_TEXT = { SelfSkillHeal: 'Heal myself', SelfBuff: 'Buff myself', SelfDispel: 'Cleanse myself', PartyHeal: 'Heal party members', PartyBuff: 'Buff party members', PartyDispel: 'Cleanse party members',
    MassHeal: 'Group heal', SkillResurrect: 'Resurrect', PetHeal: 'Heal the pet', PetBuff: 'Buff the pet', PetResurrect: 'Resurrect the pet' };
  const AUTOITEM_TYPES = ['SelfItemHeal', 'SelfDPRecover'];
  const AUTOITEM_TEXT = { SelfItemHeal: 'Use an item at %', SelfDPRecover: 'Recover the death penalty' };
  const HEAL_TYPES = ['HP', 'MP', 'CP', 'VIT'];
  const ZONE_TYPES = ['CombatRadius', 'Map', 'Polygon', 'Path'];
  const RES_TYPES = ['Party', 'PartyNames', 'Anybody', 'Manual'];
  // the scalar options the page edits: [name, kind, label, group]
  const SCALARS = [
    ['ActiveFollow', 'bool', 'Follow', 'follow'], ['FollowCurrentPartyLeader', 'bool', 'Follow the party leader', 'follow'], ['FollowName', 'text', 'Follow this character', 'follow'],
    ['FollowDistance', 'int', 'Follow distance', 'follow'], ['FollowAtk', 'bool', 'Follow attack (assist)', 'follow'], ['AtkBySelect', 'bool', 'Attack what I select', 'follow'],
    ['FollowPartyLeaderSit', 'bool', 'Sit when the leader sits', 'follow'], ['ProtectMember', 'bool', 'Protect party members', 'follow'],
    ['AutoStartCombat', 'bool', 'Start combat by itself', 'range'], ['AutoStartCombatDelay', 'int', 'Start combat after (s)', 'range'],
    ['CombatRange', 'int', 'Combat range', 'range'], ['UseCombatZLimit', 'bool', 'Height limit on', 'range'], ['CombatZLimit', 'int', 'Height limit', 'range'],
    ['CombatZoneType', 'enum:' + ZONE_TYPES.join('|'), 'Combat zone', 'range'], ['ForceCloseCombat', 'bool', 'Melee: always close in', 'range'], ['PathfindingToMob', 'bool', 'Path finding to the monster', 'range'],
    ['ReturnToStartingPoint', 'bool', 'Walk back to the start point', 'range'],
    ['PickUp', 'bool', 'Pick up drops', 'pickup'], ['PickUpRange', 'int', 'Pick-up range', 'pickup'], ['PickUpPattern', 'text', 'Only items matching (regex)', 'pickup'],
    ['UseShots', 'bool', 'Use shots', 'shots'],
    ['AutoResurrect', 'bool', 'Accept resurrection', 'res'], ['AutoResType', 'numenum:' + RES_TYPES.join('|'), 'Accept it from', 'res'],   /* stored as its number (0 = Party) */ ['UseResScrollIfNoSkill', 'bool', 'Use a resurrection scroll when no skill', 'res'],
    ['UseMassRes', 'bool', 'Use mass resurrection', 'res'], ['MassResurrectCharCount', 'int', 'Mass resurrection when this many are dead', 'res'],
    ['AutoSummon', 'bool', 'Summon my pet by itself', 'pet'], ['PetFollowAtk', 'bool', 'Pet assists', 'pet'], ['PetAtkBySelect', 'bool', 'Pet attacks what I select', 'pet'],
  ];
  const BLOCKS = ['AutoSkillsList', 'AutoItemsList', 'CombatSkillsList', 'MobSettingsList', 'EnabledShots'];

  // ---- a tiny XML tree (elements, attributes, text; no mixed content in these files) ----
  const ENT = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };
  const unesc = (s) => String(s).replace(/&(lt|gt|amp|quot|apos);/g, (m) => ENT[m]);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escA = (s) => esc(s).replace(/"/g, '&quot;');
  function parse(xml) {
    const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
    const rootN = { n: '#root', a: {}, c: [] }, stack = [rootN]; let m;
    while ((m = re.exec(xml))) {
      if (m[5] !== undefined) { const top = stack[stack.length - 1]; if (m[5].trim()) top.t = (top.t || '') + unesc(m[5]); continue; }
      if (m[1]) { stack.pop(); continue; }
      const a = {}; (m[3] || '').replace(/([\w:.-]+)\s*=\s*"([^"]*)"/g, (x, k, v) => { a[k] = unesc(v); return x; });
      const node = { n: m[2], a, c: [] }; stack[stack.length - 1].c.push(node);
      if (!m[4]) stack.push(node);
    }
    return rootN.c[0] || null;
  }
  function print(node, depth, nl) {
    const pad = '  '.repeat(depth), at = Object.keys(node.a || {}).map(k => ` ${k}="${escA(node.a[k])}"`).join('');
    if (node.c && node.c.length) return `${pad}<${node.n}${at}>${nl}${node.c.map(ch => print(ch, depth + 1, nl)).join(nl)}${nl}${pad}</${node.n}>`;
    if (node.t !== undefined && node.t !== null && node.t !== '') return `${pad}<${node.n}${at}>${esc(node.t)}</${node.n}>`;
    return `${pad}<${node.n}${at} />`;
  }
  const kid = (node, name) => (node && node.c || []).find(c => c.n === name) || null;
  const kids = (node, name) => (node && node.c || []).filter(c => c.n === name);
  const txt = (node, name) => { const k = kid(node, name); return k ? (k.t == null ? '' : String(k.t)) : undefined; };
  const bool = (v) => String(v).toLowerCase() === 'true';
  const intOr = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
  const insertAt = (node, k, after) => { let at = -1; (after || []).some(a => { const i = node.c.findIndex(c => c.n === a); if (i >= 0) { at = i; return true; } return false; }); if (at >= 0) node.c.splice(at + 1, 0, k); else node.c.push(k); };
  /** set a child's text; a missing one is inserted after the first of `after` that exists (else at the end) */
  function put(node, name, value, after) {
    let k = kid(node, name);
    if (!k) { k = { n: name, a: {}, c: [] }; insertAt(node, k, after); }
    k.c = []; k.t = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value == null ? '' : value);
    return k;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---- a top-level block in the raw text ----
  function blockRange(raw, name) {
    const open = new RegExp(`(^|\\n)([ \\t]*)<${name}(\\s[^>]*?)?\\s*(\\/)?>`).exec(raw); if (!open) return null;
    const start = open.index + open[1].length;
    if (open[4]) return { start, end: open.index + open[0].length, indent: open[2] };
    const close = raw.indexOf(`</${name}>`, open.index + open[0].length); if (close < 0) return null;
    return { start, end: close + name.length + 3, indent: open[2] };
  }
  function readBlock(raw, name) { const r = blockRange(raw, name); return r ? parse(raw.slice(r.start, r.end)) : null; }
  const nlOf = (raw) => /\r\n/.test(raw) ? '\r\n' : '\n';
  /** replace a top-level block; a missing one is added before </Option> */
  function writeBlock(raw, node) {
    const nl = nlOf(raw), r = blockRange(raw, node.n), out = print(node, 1, nl);
    if (r) return raw.slice(0, r.start) + out + raw.slice(r.end);
    const end = raw.lastIndexOf('</Option>'); if (end < 0) throw new Error('no </Option> in the file');
    return raw.slice(0, end) + out + nl + raw.slice(end);
  }

  // ---- skills / conditions ----
  function skillOf(node) { const s = kid(node, 'Skill') || kid(node, 'Item'); return s ? { id: intOr(txt(s, 'Id'), 0), name: txt(s, 'Name') || '', needTarget: bool(txt(s, 'IsNeedTarget')), mp: intOr(txt(s, 'MP'), 0), range: Number(txt(s, 'Range')) || 0 } : { id: 0, name: '' }; }
  function groupsOf(node) {
    const g = kid(kid(node, 'ConditionGroups'), 'Groups');
    return kids(g, 'CombatConditionGroup').map(G => kids(kid(G, 'Conditions'), 'CombatCondition').map(C => {
      const o = { trigger: txt(C, 'Trigger') || 'Always', value: intOr(txt(C, 'Value'), 0), distance: intOr(txt(C, 'Distance'), 0) };
      if (txt(C, 'MinLevel') !== undefined) o.minLevel = intOr(txt(C, 'MinLevel'), 0);
      if (txt(C, 'IncludeThreshold') !== undefined) o.include = bool(txt(C, 'IncludeThreshold'));
      return o;
    }));
  }
  const el = (n, t) => ({ n, a: {}, c: [], t: String(t) });
  function groupsNode(groups) {
    return { n: 'ConditionGroups', a: {}, c: [{ n: 'Groups', a: {}, c: (groups || []).filter(g => g && g.length).map(g => ({ n: 'CombatConditionGroup', a: {}, c: [{ n: 'Conditions', a: {}, c: g.map(C => {
      const c = [el('Trigger', TRIGGERS.includes(C.trigger) ? C.trigger : 'Always'), el('Value', intOr(C.value, 0)), el('Distance', intOr(C.distance, 0))];
      if (C.minLevel !== undefined) c.push(el('MinLevel', intOr(C.minLevel, 0)));
      if (C.include !== undefined) c.push(el('IncludeThreshold', C.include ? 'true' : 'false'));
      return { n: 'CombatCondition', a: {}, c };
    }) }] })) }] };
  }
  function skillNode(s, isItem) {
    if (isItem) return { n: 'Item', a: {}, c: [el('Id', intOr(s.id, 0)), el('Name', s.name || '')] };
    return { n: 'Skill', a: {}, c: [el('Id', intOr(s.id, 0)), el('Name', s.name || ''), el('IsNeedTarget', s.needTarget ? 'true' : 'false'), el('MP', intOr(s.mp, 0)),
      el('Range', intOr(s.range, 0) || (s.needTarget ? 600 : 4294967295)), el('IsNeedItem', 'false'), el('ItemId', 0), el('ItemCount', 0)] };
  }
  /** the stored Skill node stays when the skill did not change (MP / range / item need as L2Swarm wrote them) */
  function setSkill(node, s, isItem) {
    const name = isItem ? 'Item' : 'Skill', cur = kid(node, name), had = cur ? skillOf(node) : null;
    if (!cur && !(Number(s.id) > 0)) return;   // an entry without a skill (L2Swarm writes PartyDispel like that) stays without one
    if (cur && had && had.id === Number(s.id)) { if (!isItem && s.needTarget !== undefined && had.needTarget !== !!s.needTarget) put(cur, 'IsNeedTarget', !!s.needTarget); return; }
    const fresh = skillNode(s, isItem); const i = node.c.findIndex(c => c.n === name); if (i >= 0) node.c[i] = fresh; else node.c.unshift(fresh);
  }
  function setGroups(node, groups, after) {
    const i = node.c.findIndex(c => c.n === 'ConditionGroups');
    const want = (groups || []).filter(g => g && g.length);
    if (!want.length) { if (i >= 0) node.c.splice(i, 1); return; }
    if (i >= 0 && JSON.stringify(groupsOf(node)) === JSON.stringify(want)) return;
    const g = groupsNode(want); if (i >= 0) node.c[i] = g; else insertAt(node, g, after);
  }
  const namesOf = (node) => kids(kid(node, 'NameList'), 'NameCheck').map(n => ({ name: txt(n, 'Name') || '', on: bool(txt(n, 'IsSelected')) }));
  function setNames(node, names, after) {
    if (!Array.isArray(names)) return;
    if (kid(node, 'NameList') && JSON.stringify(namesOf(node)) === JSON.stringify(names.map(x => ({ name: String(x.name || ''), on: !!x.on })))) return;
    const nl = { n: 'NameList', a: {}, c: names.filter(x => x && x.name).map(x => ({ n: 'NameCheck', a: {}, c: [el('Name', x.name), el('IsSelected', x.on ? 'true' : 'false')] })) };
    const i = node.c.findIndex(c => c.n === 'NameList'); if (i >= 0) node.c[i] = nl; else insertAt(node, nl, after);
  }
  /** put only when the value changed (an unchanged entry stays byte-identical) */
  const putIfOld = (node, name, value, after) => { const cur = txt(node, name), v = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value); if (cur === undefined && (v === 'false' || v === '0' || v === '')) return; if (cur !== v) put(node, name, value, after); };   // a missing field at its default stays missing (older L2Swarm entries)

  // ---- model <-> tree ----
  function combatSkillModel(n, i) {
    const groups = groupsOf(n), s = skillOf(n);
    let g = groups;
    if (!g.length && txt(n, 'AdvCombatType')) g = [[{ trigger: txt(n, 'AdvCombatType'), value: intOr(txt(n, 'AdvCombatValue'), 0), distance: intOr(txt(n, 'AdvCombatDistance'), 0) }]];
    return { src: i, id: s.id, name: s.name, needTarget: s.needTarget, mp: s.mp, range: s.range, enabled: bool(txt(n, 'IsEnabled')), repeat: bool(txt(n, 'IsRepeat')),
      repeatDelay: intOr(txt(n, 'RepeatDelaySeconds'), 0), groups: g };
  }
  /** L2SWARM 3.9 (2026-10-17: 40 accounts refused at login, "does not match the internal schema"): inside a CombatSkill the basic part
   *  (Skill, IsEnabled, IsRepeat, RepeatDelaySeconds) must come before the advanced part (isAdvanced, AdvCombatType ...); 3.8 wrote
   *  isAdvanced before IsRepeat. RepeatDelaySeconds 0 (the default) is left out. */
  function order39(n) {
    const take = (name) => { const i = n.c.findIndex(c => c.n === name); return i >= 0 ? n.c.splice(i, 1)[0] : null; };
    const rd = take('RepeatDelaySeconds'), rp = take('IsRepeat'), ia = take('isAdvanced');
    let at = n.c.findIndex(c => c.n === 'IsEnabled'); if (at < 0) at = n.c.findIndex(c => c.n === 'Skill');
    // 2026-10-23: L2Swarm 3.9.x itself writes RepeatDelaySeconds (also 0) BEFORE IsRepeat: keep one that is there, in L2Swarm's own order
    // (it accepts the files it writes); a new 0 is still left out (putIfOld never adds a missing default)
    const ins = [rd, rp, ia].filter(Boolean);
    n.c.splice(at + 1, 0, ...ins);
  }
  function combatSkillNode(m, old) {
    const putIf = old ? putIfOld : put;   // new entries get every field; L2Swarm's own entries keep "missing stays missing"
    const n = old ? clone(old) : { n: 'CombatSkill', a: { 'xsi:type': 'CombatSkillAdv' }, c: [] };
    if (!old) n.a['xsi:type'] = 'CombatSkillAdv';
    setSkill(n, m, false);
    putIf(n, 'IsEnabled', !!m.enabled, ['Skill']);
    if (!old) put(n, 'isAdvanced', true, ['IsEnabled']);
    putIf(n, 'RepeatDelaySeconds', intOr(m.repeatDelay, 0), ['isAdvanced', 'IsEnabled']);
    putIf(n, 'IsRepeat', !!m.repeat, ['RepeatDelaySeconds']);
    const groups = (m.groups || []).filter(g => g && g.length);
    const was = old ? combatSkillModel(old, 0).groups : null;
    if (!old || JSON.stringify(was) !== JSON.stringify(groups)) {
      // the page edits the condition groups; the old single condition (AdvCombatType + value) mirrors the first condition
      const use = groups.length ? groups : [[{ trigger: 'Always', value: 0, distance: 0 }]], first = use[0][0];
      put(n, 'AdvCombatType', TRIGGERS.includes(first.trigger) ? first.trigger : 'Always', ['IsRepeat']);
      put(n, 'IncludeThreshold', first.include !== undefined ? !!first.include : true, ['AdvCombatType']);
      put(n, 'LegacySimpleBehavior', false, ['IncludeThreshold']);
      setGroups(n, use, ['LegacySimpleBehavior']);
      put(n, 'AdvCombatValue', intOr(first.value, 0), ['ConditionGroups']);
      put(n, 'AdvCombatDistance', intOr(first.distance, 0), ['AdvCombatValue']);
    }
    order39(n);
    return n;
  }
  function autoSkillModel(n, i) {
    const s = skillOf(n), m = { src: i, type: n.a['xsi:type'] || '', id: s.id, name: s.name, needTarget: s.needTarget, mp: s.mp, range: s.range, enabled: bool(txt(n, 'IsEnabled')) };
    if (kid(n, 'NameList')) m.names = namesOf(n);
    if (txt(n, 'HealType') !== undefined) m.healType = txt(n, 'HealType');
    if (txt(n, 'Percents') !== undefined) m.percents = intOr(txt(n, 'Percents'), 0);
    if (txt(n, 'CountMembers') !== undefined) m.countMembers = intOr(txt(n, 'CountMembers'), 0);
    if (txt(n, 'MinMpPercent') !== undefined) m.minMp = intOr(txt(n, 'MinMpPercent'), 0);
    if (txt(n, 'Delay') !== undefined) m.delay = intOr(txt(n, 'Delay'), 0);
    if (txt(n, 'IsAuto') !== undefined) m.isAuto = bool(txt(n, 'IsAuto'));
    if (kid(n, 'ConditionGroups')) m.groups = groupsOf(n);
    return m;
  }
  // the fields of each auto-skill kind (L2Swarm.Core.dll), in L2Swarm's order after Skill + IsEnabled
  const AUTO_FIELDS = { SelfSkillHeal: ['Percents', 'HealType'], SelfBuff: ['MinMpPercent', 'Delay', 'IsAuto'], SelfDispel: [], PartyHeal: ['NameList', 'HealType', 'Percents'],
    PartyBuff: ['NameList', 'Delay', 'IsAuto'], PartyDispel: ['NameList'], MassHeal: ['HealType', 'Percents', 'CountMembers'], SkillResurrect: ['NameList'], PetHeal: ['NameList', 'HealType', 'Percents'],
    PetBuff: ['NameList', 'Delay', 'IsAuto'], PetResurrect: ['NameList'] };
  const AUTO_DEF = { Percents: 50, CountMembers: 3, MinMpPercent: 0, Delay: 0 };
  function autoSkillNode(m, old) {
    const putIf = old && old.a['xsi:type'] === m.type ? putIfOld : put;
    const type = AUTOSKILL_TYPES.includes(m.type) ? m.type : 'SelfBuff';
    const n = old && old.a['xsi:type'] === type ? clone(old) : { n: 'AutoSkill', a: { 'xsi:type': type }, c: [] };
    const fresh = !(old && old.a['xsi:type'] === type);
    setSkill(n, m, false);
    putIf(n, 'IsEnabled', !!m.enabled, ['Skill']);
    let prev = ['IsEnabled'];
    AUTO_FIELDS[type].forEach(f => {
      if (f === 'NameList') setNames(n, m.names || [], prev);
      else if (f === 'HealType') { if (fresh || m.healType !== undefined) putIf(n, f, HEAL_TYPES.includes(m.healType) ? m.healType : 'HP', prev); }
      else if (f === 'IsAuto') { if (fresh || m.isAuto !== undefined) putIf(n, f, !!m.isAuto, prev); }
      else { const key = { Percents: 'percents', CountMembers: 'countMembers', MinMpPercent: 'minMp', Delay: 'delay' }[f]; if (fresh || m[key] !== undefined) putIf(n, f, intOr(m[key], AUTO_DEF[f]), prev); }
      prev = [f].concat(prev);
    });
    if (m.groups !== undefined) setGroups(n, m.groups, prev);
    return n;
  }
  function autoItemModel(n, i) {
    const s = skillOf(n), m = { src: i, type: n.a['xsi:type'] || '', id: s.id, name: s.name, enabled: bool(txt(n, 'IsEnabled')) };
    if (txt(n, 'Percents') !== undefined) m.percents = intOr(txt(n, 'Percents'), 0);
    if (txt(n, 'Delay') !== undefined) m.delay = intOr(txt(n, 'Delay'), 0);
    if (txt(n, 'UseTimer') !== undefined) m.useTimer = bool(txt(n, 'UseTimer'));
    if (txt(n, 'HealType') !== undefined) m.healType = txt(n, 'HealType');
    if (kid(n, 'ConditionGroups')) m.groups = groupsOf(n);
    return m;
  }
  function autoItemNode(m, old) {
    const putIf = old && old.a['xsi:type'] === m.type ? putIfOld : put;
    const type = AUTOITEM_TYPES.includes(m.type) ? m.type : 'SelfItemHeal';
    const n = old && old.a['xsi:type'] === type ? clone(old) : { n: 'AutoItem', a: { 'xsi:type': type }, c: [] };
    if (type === 'SelfDPRecover') { putIf(n, 'IsEnabled', !!m.enabled); return n; }
    setSkill(n, m, true);
    putIf(n, 'IsEnabled', !!m.enabled, ['Item']);
    putIf(n, 'Percents', intOr(m.percents, 50), ['IsEnabled']);
    putIf(n, 'Delay', intOr(m.delay, 0), ['Percents']);
    putIf(n, 'UseTimer', !!m.useTimer, ['Delay']);
    putIf(n, 'HealType', HEAL_TYPES.includes(m.healType) ? m.healType : 'HP', ['UseTimer']);
    if (m.groups !== undefined) setGroups(n, m.groups, ['HealType']);
    return n;
  }
  const mobModel = (n) => ({ id: intOr(txt(n, 'Id'), 0), name: txt(n, 'Name') || '', attack: bool(txt(n, 'ToAttack')), spoil: bool(txt(n, 'ToSpoil')) });
  function mobNode(m, old) {
    const putIf = old ? putIfOld : put;
    const n = old ? clone(old) : { n: 'L2MobSettings', a: {}, c: [] };
    putIf(n, 'Id', intOr(m.id, 0)); putIf(n, 'Name', m.name || '', ['Id']); putIf(n, 'ToAttack', !!m.attack, ['Name', 'LegacyId', 'Id']); putIf(n, 'ToSpoil', !!m.spoil, ['ToAttack']);
    return n;
  }

  // ---- whole profile ----
  function scalarOf(raw, name) {
    const m = new RegExp(`\\n[ \\t]*<${name}>([^<]*)</${name}>`).exec(raw); if (m) return unesc(m[1]);
    return new RegExp(`\\n[ \\t]*<${name}\\s*/>`).test(raw) ? '' : undefined;
  }
  function readProfile(raw) {
    const B = {}; BLOCKS.forEach(b => { B[b] = readBlock(raw, b); });
    const scalars = {};
    SCALARS.forEach(([n, kind]) => { const v = scalarOf(raw, n); if (v === undefined) return; scalars[n] = kind === 'bool' ? bool(v) : kind === 'int' ? intOr(v, 0) : v; });
    return {
      combatSkills: kids(B.CombatSkillsList, 'CombatSkill').map(combatSkillModel),
      autoSkills: kids(B.AutoSkillsList, 'AutoSkill').map(autoSkillModel),
      autoItems: kids(B.AutoItemsList, 'AutoItem').map(autoItemModel),
      mobs: kids(B.MobSettingsList, 'L2MobSettings').map(mobModel),
      shots: kids(B.EnabledShots, 'L2ShotsTypes').map(n => String(n.t || '')),
      scalars,
    };
  }
  /** check a profile sent by the page -> plain-sentence errors */
  function validate(p) {
    const errors = [], o = p && typeof p === 'object' ? p : {};
    const arr = (k) => Array.isArray(o[k]) ? o[k] : [];
    arr('combatSkills').forEach((s, i) => { if (!(Number(s.id) > 0) && !Number.isInteger(s.src)) errors.push(`Combat skill ${i + 1}: choose a skill.`); (s.groups || []).forEach(g => (g || []).forEach(c => { if (!TRIGGERS.includes(c.trigger)) errors.push(`Combat skill ${i + 1}: unknown condition "${c.trigger}".`); })); });
    arr('autoSkills').forEach((s, i) => { if (!AUTOSKILL_TYPES.includes(s.type)) errors.push(`Auto skill ${i + 1}: unknown kind "${s.type}".`); if (!(Number(s.id) > 0) && !Number.isInteger(s.src)) errors.push(`Auto skill ${i + 1}: choose a skill.`); });   // L2Swarm keeps e.g. a Party cleanse without a skill
    arr('autoItems').forEach((s, i) => { if (!AUTOITEM_TYPES.includes(s.type)) errors.push(`Auto item ${i + 1}: unknown kind "${s.type}".`); if (s.type === 'SelfItemHeal' && !(Number(s.id) > 0)) errors.push(`Auto item ${i + 1}: choose an item.`); });
    arr('mobs').forEach((m, i) => { if (!(Number(m.id) > 0)) errors.push(`Monster ${i + 1}: no monster id.`); });
    const sc = o.scalars && typeof o.scalars === 'object' ? o.scalars : {};
    Object.keys(sc).forEach(k => { const d = SCALARS.find(x => x[0] === k); if (!d) { errors.push(`Unknown setting ${k}.`); return; }
      if (d[1] === 'int' && !Number.isFinite(Number(sc[k]))) errors.push(`${d[2]}: must be a number.`);
      if (d[1].startsWith('enum:') && !d[1].slice(5).split('|').includes(String(sc[k]))) errors.push(`${d[2]}: one of ${d[1].slice(5).replace(/\|/g, ', ')}.`);
      if (d[1].startsWith('numenum:') && !(/^\d+$/.test(String(sc[k])) && Number(sc[k]) < d[1].slice(8).split('|').length)) errors.push(`${d[2]}: one of ${d[1].slice(8).replace(/\|/g, ', ')}.`); });
    return errors;
  }
  /** the new file text: only what is in `p` is written; untouched blocks / entries / settings stay byte-identical */
  function writeProfile(raw, p) {
    let out = raw;
    const oldB = {}; BLOCKS.forEach(b => { oldB[b] = readBlock(raw, b); });
    const empty = (name) => ({ n: name, a: {}, c: [] });
    const replaceIf = (name, node) => { if (print(node, 1, '\n') !== print(oldB[name] || empty(name), 1, '\n')) out = writeBlock(out, node); };
    const list = (name, item, model, toNode) => {
      if (!Array.isArray(p[model])) return;
      const old = kids(oldB[name], item);
      replaceIf(name, { n: name, a: {}, c: p[model].map(m => toNode(m, Number.isInteger(m.src) && old[m.src] ? old[m.src] : null)) });
    };
    list('CombatSkillsList', 'CombatSkill', 'combatSkills', combatSkillNode);
    list('AutoSkillsList', 'AutoSkill', 'autoSkills', autoSkillNode);
    list('AutoItemsList', 'AutoItem', 'autoItems', autoItemNode);
    if (Array.isArray(p.mobs)) { const byId = {}; kids(oldB.MobSettingsList, 'L2MobSettings').forEach(n => { byId[txt(n, 'Id')] = n; }); replaceIf('MobSettingsList', { n: 'MobSettingsList', a: {}, c: p.mobs.map(m => mobNode(m, byId[String(m.id)] || null)) }); }
    if (Array.isArray(p.shots)) replaceIf('EnabledShots', { n: 'EnabledShots', a: {}, c: p.shots.filter(Boolean).map(s => el('L2ShotsTypes', s)) });
    const sc = p.scalars && typeof p.scalars === 'object' ? p.scalars : {};
    Object.keys(sc).forEach(k => {
      const d = SCALARS.find(x => x[0] === k); if (!d) return;
      const v = d[1] === 'bool' ? (sc[k] ? 'true' : 'false') : d[1] === 'int' ? String(Math.round(Number(sc[k]))) : String(sc[k]);
      if (scalarOf(out, k) === v) return;
      const re = new RegExp(`(\\n[ \\t]*)<${k}>[^<]*</${k}>|(\\n[ \\t]*)<${k}\\s*/>`);
      if (re.test(out)) out = out.replace(re, (m0, a, b) => `${a || b}<${k}>${esc(v)}</${k}>`);
      else { const end = out.lastIndexOf('</Option>'); out = out.slice(0, end) + `  <${k}>${esc(v)}</${k}>` + nlOf(out) + out.slice(end); }
    });
    return out;
  }
  /** everything outside the profile parts is identical (Password, login, paths ...) */
  function untouchedSame(a, b) {
    // the profile parts are cut out WITH their line (a setting / block the editor ADDED to a profile that had none must not count as "something
    // else changed" — the 2026-10-17 package test: the example profiles lack some settings)
    const strip = (raw) => {
      let r = raw;
      BLOCKS.forEach(n => { const x = blockRange(r, n); if (x) { let s0 = x.start; while (s0 > 0 && /[ \t]/.test(r[s0 - 1])) s0--; if (s0 > 0 && r[s0 - 1] === '\n') { s0--; if (s0 > 0 && r[s0 - 1] === '\r') s0--; } r = r.slice(0, s0) + r.slice(x.end); } });
      SCALARS.forEach(([k]) => { r = r.replace(new RegExp(`(\\r?\\n[ \\t]*)?(<${k}>[^<]*</${k}>|<${k}\\s*/>)`), ''); });
      return r;
    };
    return strip(a) === strip(b);
  }
  return { TRIGGERS, TRIGGER_TEXT, AUTOSKILL_TYPES, AUTOSKILL_TEXT, AUTOITEM_TYPES, AUTOITEM_TEXT, HEAL_TYPES, ZONE_TYPES, RES_TYPES, SCALARS, AUTO_FIELDS, BLOCKS,
    parse, print, readBlock, blockRange, readProfile, writeProfile, validate, untouchedSame };
});
