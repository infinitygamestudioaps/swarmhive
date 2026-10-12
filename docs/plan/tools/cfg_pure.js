// cfg_pure.js — L2Toggle ".cfg" (Alt+B -> Home/Cabinet -> Settings) page parser + setting finder + diff (2026-10-12).
// Pure: no host objects. Used by docs/plan/tools/server_cfg.js (data/doc generator), docs/plan/tools/test_cfg.js and inserted into
// Scripts_dev/swarm.js by the patch patch_servercfg.js (the block between the CFG-PURE markers, copied verbatim).
// Docs: docs/plan/server_cfg.md · data: Scripts/data/server_cfg.json.
// ==== CFG-PURE begin (copied verbatim into swarm.js by patch_servercfg.js; tested by docs/plan/tools/test_cfg.js)
// Stable keys for every row of the live Kain page (63 captures, Logs/cabinet_*.html). Matching is on section + label, never on the
// bypass code (the page could renumber). OLD names (forum topic 60, 2020) map to the same keys.
var CFG_KEYS = [
  ['language', /^localization$/i, /^language$/i],
  ['translit', /^settings$/i, /^translit$/i],
  ['blockExp', /^settings$/i, /^block experience$/i],
  ['blockPetExp', /^settings$/i, /^block pet experience$/i],
  ['noTraders', /^settings$/i, /^do not show traders$/i],
  ['noAnimations', /^settings$/i, /^disable (buffs )?animations?$/i],
  ['classicShift', /^settings$/i, /^classic shift$/i],
  ['followDialog', /^settings$/i, /^follow party leader'?s (npc )?dialog$/i],
  ['followTown', /^settings$/i, /^follow party leader'?s \.town$/i],
  ['followDead', /^settings$/i, /^follow party leader'?s dead to village/i],
  ['forwardDrop', /^settings$/i, /^forward drop to party leader$/i],
  ['qtMaster', /^quick trade/i, /^master account$/i],
  ['qtParty', /^quick trade/i, /^party$/i],
  ['qtSameIp', /^quick trade/i, /^same ip$/i],
  ['qaMaster', /^quick accept/i, /^master account$/i],
  ['qaSameIp', /^quick accept/i, /^same ip$/i],
  ['noCarrier', /^no carrier$/i, /^(no carrier|current value)$/i],
];
// short names the user / dashboard may type for a section ("Quick Trade: Party", "qa: same ip")
var CFG_SECTION_ALIAS = [[/^(quick ?trade|qt|trade)$/i, /^quick trade/i], [/^(quick ?accept|qa|invite|invites|invitations|accept)$/i, /^quick accept/i],
  [/^(settings?|cfg)$/i, /^settings$/i], [/^(localization|lang)$/i, /^localization$/i], [/^(no ?carrier)$/i, /^no carrier$/i]];
// old / other names of a row -> key
var CFG_ALIAS = { 'disable buffs animation': 'noAnimations', 'disable buff animation': 'noAnimations', 'forward drop': 'forwardDrop',
  'block exp': 'blockExp', 'no exp': 'blockExp', "follow party leader's npc dialog": 'followDialog', 'follow dialog': 'followDialog',
  'follow town': 'followTown', 'follow .town': 'followTown', 'follow dead': 'followDead', 'no traders': 'noTraders', 'hide traders': 'noTraders',
  'disable animations': 'noAnimations', 'no carrier': 'noCarrier' };

function cfgText(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#0?39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim(); }
function cfgNorm(s) { return cfgText(s).toLowerCase().replace(/[:\s]+$/, '').replace(/\s+/g, ' ').trim(); }
function cfgKeyOf(section, label) {
  const s = cfgNorm(section), l = cfgNorm(label);
  for (let i = 0; i < CFG_KEYS.length; i++) if (CFG_KEYS[i][1].test(s) && CFG_KEYS[i][2].test(l)) return CFG_KEYS[i][0];
  return (s + '.' + l).replace(/[^a-z0-9.]+/g, '_');
}
/** "Section: Label" for messages */
function cfgName(row) { return row ? (/^settings$/i.test(row.section) || !row.section ? row.label : `${row.section}: ${row.label}`) : '?'; }

/** Parse the Settings page. Returns { ok, title, rows: [{ section, label, key, kind: 'toggle'|'choice'|'number', state, value, button, bypass, cmd }] }.
 *  toggle: state true (On) / false (Off) / null, button = the label of its button (the value it switches TO), cmd = the bypass without "-h ".
 *  choice (Language): value = current text, button = the other choice. number (No Carrier): value = current number, cmd = "010 $set". */
function cfgParse(html) {
  const h = String(html || ''), rows = [];
  const title = ((/<title>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || '').trim();
  let section = '', m;
  const re = /<center>\s*<font[^>]*>([\s\S]*?)<\/font>\s*<\/center>|<tr\b[\s\S]*?<\/tr>/gi;
  while ((m = re.exec(h))) {
    if (m[1] != null) { section = cfgText(m[1]); continue; }
    const tr = m[0];
    const cells = []; let c; const tdre = /<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr>)/gi;
    while ((c = tdre.exec(tr))) cells.push(c[1].replace(/<\/td>\s*$/i, ''));
    const texts = cells.map(cfgText);
    const btn = /<button\b[^>]*>/i.exec(tr);
    const bVal = btn ? ((/value="([^"]*)"/i.exec(btn[0]) || [])[1] || '').trim() : '';
    const bAct = btn ? ((/action="bypass\s+([^"]*)"/i.exec(btn[0]) || [])[1] || '').trim() : '';
    const hasEdit = /<edit\b/i.test(tr);
    const label = (texts[1] || '').replace(/:\s*$/, '').trim();
    const valTxt = (texts[2] || '').trim();
    const prev = rows[rows.length - 1];
    if (!label && (btn || hasEdit) && prev && prev.section === section && !prev.cmd) {   // second line of a block (Language button, No Carrier edit box)
      prev.button = bVal; prev.bypass = bAct; prev.cmd = bAct.replace(/^-h\s+/i, '').trim();
      if (hasEdit) prev.kind = 'number';
      continue;
    }
    if (!label) continue;
    const row = { section, label, key: '', kind: 'toggle', state: null, value: valTxt, button: bVal, bypass: bAct, cmd: bAct.replace(/^-h\s+/i, '').trim() };
    if (/^on$/i.test(valTxt)) row.state = true; else if (/^off$/i.test(valTxt)) row.state = false;
    else { row.kind = /^no carrier$/i.test(section) ? 'number' : 'choice'; }
    if (row.kind === 'number' && /^current value$/i.test(label)) row.label = section || 'No Carrier';
    row.key = cfgKeyOf(section, row.label);
    rows.push(row);
  }
  return { ok: rows.some(r => r.key === 'followTown' || r.key === 'blockExp'), title, rows };
}

/** Find ONE row for a user text / key. Never guesses: "Master Account" (in two sections) = ambiguous error.
 *  Accepts a key (qtParty), "Section: Label" (Quick Trade: Party, qa: same ip), an alias (Forward Drop, Disable Buffs Animation) or a label
 *  (exact > starts with > contains). Returns { row } or { err, options }. */
function cfgFind(rows, query) {
  const list = rows || [], q = cfgNorm(query);
  if (!q) return { err: 'no setting given', options: list.map(cfgName) };
  const byKey = list.filter(r => r.key.toLowerCase() === q.replace(/\s+/g, ''));
  if (byKey.length === 1) return { row: byKey[0] };
  if (CFG_ALIAS[q]) { const a = list.filter(r => r.key === CFG_ALIAS[q]); if (a.length === 1) return { row: a[0] }; }
  let pool = list, lq = q;
  const ci = q.indexOf(':');
  if (ci > 0) {
    const sq = q.slice(0, ci).trim(), rest = q.slice(ci + 1).trim();
    let sre = null;
    CFG_SECTION_ALIAS.forEach(p => { if (!sre && p[0].test(sq)) sre = p[1]; });
    const secRows = list.filter(r => sre ? sre.test(r.section) : cfgNorm(r.section).indexOf(sq) >= 0);
    if (secRows.length) { pool = secRows; lq = rest; }
  }
  const L = (r) => cfgNorm(r.label);
  let hit = pool.filter(r => L(r) === lq);
  if (!hit.length) hit = pool.filter(r => L(r).indexOf(lq) === 0);
  if (!hit.length) hit = pool.filter(r => L(r).indexOf(lq) >= 0);
  if (hit.length === 1) return { row: hit[0] };
  if (!hit.length) return { err: `no setting '${query}' on Cabinet -> Settings`, options: list.map(cfgName) };
  return { err: `'${query}' is ambiguous: ${hit.map(cfgName).join(' | ')} — say which one`, options: hit.map(cfgName) };
}

/** What has to change. want = { key: true|false (toggle) | 'English' (language) | number (noCarrier) | null (leave it) }.
 *  Returns { changes: [{ key, name, from, to, cmd, kind }], missing: [keys not on the page], same: [keys already right], refused: [{ key, why }] } */
function cfgDiff(rows, want) {
  const out = { changes: [], missing: [], same: [], refused: [] }, w = want || {};
  Object.keys(w).forEach(k => {
    const v = w[k];
    if (v == null || k.charAt(0) === '_') return;
    const r = (rows || []).find(x => x.key === k);
    if (!r) { out.missing.push(k); return; }
    if (r.kind === 'toggle') {
      if (typeof v !== 'boolean') { out.refused.push({ key: k, why: 'want must be true/false' }); return; }
      if (r.state === v) { out.same.push(k); return; }
      if (r.state == null || !r.cmd) { out.refused.push({ key: k, why: 'state or button unknown' }); return; }
      out.changes.push({ key: k, name: cfgName(r), from: r.state, to: v, cmd: r.cmd, kind: 'toggle' });
    } else if (r.kind === 'choice') {
      if (cfgNorm(r.value) === cfgNorm(v)) { out.same.push(k); return; }
      if (!r.cmd || cfgNorm(r.button) !== cfgNorm(v)) { out.refused.push({ key: k, why: `the button switches to '${r.button}', not '${v}'` }); return; }
      out.changes.push({ key: k, name: cfgName(r), from: r.value, to: v, cmd: r.cmd, kind: 'choice' });
    } else if (r.kind === 'number') {
      const n = Math.floor(Number(v));
      if (!isFinite(n) || n < 0 || n > 3600) { out.refused.push({ key: k, why: 'number 0..3600 expected' }); return; }
      if (String(n) === String(r.value).trim()) { out.same.push(k); return; }
      if (!/\$set\b/.test(r.cmd)) { out.refused.push({ key: k, why: 'no $set input on the page' }); return; }
      out.changes.push({ key: k, name: cfgName(r), from: r.value, to: n, cmd: r.cmd.replace(/\$set\b/, String(n)), kind: 'number' });
    }
  });
  return out;
}
/** compact one-line state: "translit=Off blockExp=On ... noCarrier=0" */
function cfgSummary(rows) {
  return (rows || []).map(r => `${r.key}=${r.kind === 'toggle' ? (r.state === true ? 'On' : r.state === false ? 'Off' : '?') : r.value}`).join(' ');
}
/** the wanted values of server_cfg.json botDefaults for one character: want (+ trial when trial: true), minus blockExp (the LEVEL LOCK
 *  owns it) and minus "_" keys. chars.<Name> = { key: value } overrides per character. */
function cfgWantOf(botDefaults, name, withTrial) {
  const d = botDefaults || {}, o = {};
  [d.want || {}, withTrial ? (d.trial || {}) : {}, ((d.chars || {})[name]) || {}].forEach(src => Object.keys(src).forEach(k => { o[k] = src[k]; }));
  delete o.blockExp;
  Object.keys(o).forEach(k => { if (k.charAt(0) === '_' || o[k] == null) delete o[k]; });
  return o;
}
/** may the auto-apply run for this character now? s = { name, ready, dead, combat, busy, mode, sinceReadyMs, sinceLastMs, sinceFailMs } */
function cfgAutoAllowed(d, s) {
  if (!d || d.autoApply !== true) return 'autoApply off';
  if ((d.onlyChars || []).length && d.onlyChars.indexOf(s.name) < 0) return 'not in onlyChars';
  if ((d.skipChars || []).indexOf(s.name) >= 0) return 'in skipChars';
  if (!s.ready || s.dead) return 'not ready';
  if (s.sinceReadyMs < (Number(d.startDelayS) || 120) * 1000) return 'start delay';
  if (s.sinceLastMs != null && s.sinceLastMs < (Number(d.verifyHours) || 12) * 3600e3) return 'checked recently';
  if (s.sinceFailMs != null && s.sinceFailMs < 15 * 60000) return 'failed recently';
  if (s.combat || s.busy) return 'busy';
  if (['raid', 'prep', 'mission', 'raidclear', 'regroup'].indexOf(String(s.mode || '')) >= 0) return 'mode ' + s.mode;
  return '';
}
/** { key: value } map of a parsed page (toggle -> true/false/null, others -> text) */
function cfgValues(rows) { const o = {}; (rows || []).forEach(r => { o[r.key] = r.kind === 'toggle' ? r.state : r.value; }); return o; }
// ==== CFG-PURE end
if (typeof module !== 'undefined' && module.exports) module.exports = { CFG_KEYS, CFG_ALIAS, cfgText, cfgNorm, cfgKeyOf, cfgName, cfgParse, cfgFind, cfgDiff, cfgSummary, cfgValues, cfgWantOf, cfgAutoAllowed };
