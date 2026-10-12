// test_cfg.js — tests for the L2Toggle ".cfg" data + logic (2026-10-12).   node docs/plan/tools/test_cfg.js
// Covers: docs/plan/tools/cfg_pure.js (CFG-PURE: parser, finder, diff, wanted values, auto gate), Scripts/data/server_cfg.json,
// the dashboard CABINET suggestions (Dashboard/commands.js), the live captures Logs/cabinet_*.html (when present) and the swarm.js patch
// (patch_servercfg.js on a COPY + node --check; env PATCH = its path; skipped when not found). Never touches the game or swarm.js.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const P = require('./cfg_pure.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));

// ---------------------------------------------------------------- fixture in the live page format (Logs/cabinet_Tank1.html, 2026-10-04)
const T = (label, on, code, lvl) => `<tr>        <td width=2></td>        <td width=180>${lvl ? '<font color="LEVEL">' : ''}${label}: ${lvl ? '</font>' : ''}</td>        <td width=40 align=center><font color="${on ? '00ff00' : 'ff0000'}">${on ? 'On' : 'Off'}</font></td>        <td width=40 align=center><button width=40 height=20 back="L2UI_CT1.Button_DF_Down" fore="L2UI_CT1.Button_DF" action="bypass -h ${code}" value="${on ? 'Off' : 'On'}"></td>    </tr>    `;
const SEC = (t) => `</table><br><center><font color="LEVEL">${t}</font></center><table>    `;
function page(o) {
  const v = Object.assign({ lang: 'English', translit: false, blockExp: false, blockPetExp: false, noTraders: false, noAnimations: false, classicShift: false,
    followDialog: true, followTown: true, followDead: true, forwardDrop: false, qtMaster: true, qtParty: false, qtSameIp: true, qaMaster: true, qaSameIp: true, noCarrier: 0 }, o || {});
  return '<html><title>Settings</title><body><br><center><font color="LEVEL">Localization</font></center><table>' +
    `<tr><td fixwidth=2></td><td fixwidth=160>Language:</td><td fixwidth=100 align=center>${v.lang}</td></tr>` +
    `<tr><td fixwidth=2></td><td fixwidth=160></td><td fixwidth=100 align=center><button width=90 height=20 action="bypass -h 00" value="${v.lang === 'English' ? 'Русский' : 'English'}"></td></tr>` +
    SEC('Settings') + T('Translit', v.translit, '01') + T('Block experience', v.blockExp, '02') + T('Block pet experience', v.blockPetExp, '03') +
    T('Do not show traders', v.noTraders, '04') + T('Disable Animations', v.noAnimations, '05') + T('Classic Shift', v.classicShift, '06') +
    T("Follow Party Leader's Dialog", v.followDialog, '07') + T("Follow Party Leader's .town", v.followTown, '08') +
    T("Follow Party Leader's Dead to Village/etc.", v.followDead, '09') + T('Forward Drop to Party Leader', v.forwardDrop, '0a', true) +
    SEC('Quick Trade - Skip Confirmations') + T('Master Account', v.qtMaster, '0b') + T('Party', v.qtParty, '0c') + T('Same IP', v.qtSameIp, '0d') +
    SEC('Quick Accept Party/Clan Invitations') + T('Master Account', v.qaMaster, '0e') + T('Same IP', v.qaSameIp, '0f') +
    '</table><br><center><font color="LEVEL">No Carrier</font></center><table>' +
    `<tr><td width=2></td><td width=160>Current value:</td><td width=100 align=center>${v.noCarrier}</td></tr>` +
    '<tr><td width=2></td><td width=160><edit var="set" width=150 height=12></td><td width=100 align=center><button width=90 height=20 action="bypass -h 010 $set" value="Set"></td></tr></table><br></body></html>';
}
const ALLKEYS = ['language', 'translit', 'blockExp', 'blockPetExp', 'noTraders', 'noAnimations', 'classicShift', 'followDialog', 'followTown', 'followDead',
  'forwardDrop', 'qtMaster', 'qtParty', 'qtSameIp', 'qaMaster', 'qaSameIp', 'noCarrier'];

// ---------------------------------------------------------------- 1) parser
{
  const r = P.cfgParse(page());
  ok(r.ok, 'parse: page recognised');
  eq(r.title, 'Settings', 'parse: title');
  eq(r.rows.map(x => x.key), ALLKEYS, 'parse: 17 rows in page order with stable keys');
  const by = {}; r.rows.forEach(x => { by[x.key] = x; });
  eq([by.language.kind, by.language.value, by.language.button, by.language.cmd], ['choice', 'English', 'Русский', '00'], 'parse: language row merged with its button line');
  eq([by.qtParty.section, by.qtParty.label, by.qtParty.state, by.qtParty.button, by.qtParty.cmd, by.qtParty.bypass], ['Quick Trade - Skip Confirmations', 'Party', false, 'On', '0c', '-h 0c'], 'parse: Quick Trade Party row (cmd without "-h ")');
  eq([by.forwardDrop.label, by.forwardDrop.state], ['Forward Drop to Party Leader', false], 'parse: LEVEL-coloured label');
  eq([by.followDialog.state, by.followDialog.button], [true, 'Off'], 'parse: On row has an Off button');
  eq([by.noCarrier.kind, by.noCarrier.label, by.noCarrier.value, by.noCarrier.cmd], ['number', 'No Carrier', '0', '010 $set'], 'parse: No Carrier number row');
  eq([by.qaSameIp.section, by.qaSameIp.label], ['Quick Accept Party/Clan Invitations', 'Same IP'], 'parse: second Same IP is in Quick Accept');
  eq(P.cfgParse('<html>nothing</html>').ok, false, 'parse: other page not recognised');
  eq(P.cfgParse('').rows.length, 0, 'parse: empty');
  eq(P.cfgSummary(r.rows).split(' ').length, 17, 'summary: one item per row');
  eq(P.cfgValues(r.rows).qtParty, false, 'values map');
  const ru = P.cfgParse(page({ lang: 'Русский' })).rows.find(x => x.key === 'language');
  eq([ru.value, ru.button], ['Русский', 'English'], 'parse: Russian page offers English');
  eq(P.cfgKeyOf('Settings', 'Disable Buffs Animation'), 'noAnimations', 'key: 2020 name maps to the live key');
}

// ---------------------------------------------------------------- 2) finder (the cabinetSet fix)
{
  const rows = P.cfgParse(page()).rows;
  const f = (q) => { const x = P.cfgFind(rows, q); return x.row ? x.row.key : 'ERR'; };
  eq(f('Party'), 'qtParty', 'find: bare Party = the row LABELLED Party, not Follow Party Leader\'s Dialog');
  eq(f('Master Account'), 'ERR', 'find: Master Account is ambiguous');
  eq(f('Same IP'), 'ERR', 'find: Same IP is ambiguous');
  ok(/ambiguous/.test(P.cfgFind(rows, 'Same IP').err) && P.cfgFind(rows, 'Same IP').options.length === 2, 'find: ambiguous names both options');
  eq(f('Quick Trade: Same IP'), 'qtSameIp', 'find: section-qualified');
  eq(f('quick accept: same ip'), 'qaSameIp', 'find: case-insensitive section');
  eq(f('qa: master account'), 'qaMaster', 'find: short section alias');
  eq(f('Quick Trade - Skip Confirmations: Party'), 'qtParty', 'find: full section name');
  eq(f('qtParty'), 'qtParty', 'find: by key');
  eq(f('Forward Drop'), 'forwardDrop', 'find: alias / prefix');
  eq(f('Block experience'), 'blockExp', 'find: Block experience is not Block pet experience');
  eq(f('Block pet experience'), 'blockPetExp', 'find: Block pet experience');
  eq(f('Disable Buffs Animation'), 'noAnimations', 'find: 2020 name');
  eq(f("Follow Party Leader's .town"), 'followTown', 'find: .town row');
  eq(f("Follow Party Leader's Dead to Village"), 'followDead', 'find: prefix of Dead to Village/etc.');
  eq(f("Follow Party Leader's Dialog:"), 'followDialog', 'find: trailing colon');
  eq(f('Follow Party'), 'ERR', 'find: "Follow Party" matches 3 rows -> refused');
  eq(f('Nonexistent'), 'ERR', 'find: unknown');
  eq(f(''), 'ERR', 'find: empty');
  // the OLD cabinetSet row lookup (first <tr> containing the text) — documents the bug the patch fixes
  const html = page(), oldRow = (label) => (html.match(/<tr\b[\s\S]*?<\/tr>/gi) || []).find(r => P.cfgText(r).toLowerCase().includes(label.toLowerCase()));
  ok(/Follow Party Leader's Dialog/.test(oldRow('Party')), 'old lookup: "Party" hit Follow Party Leader\'s Dialog (bug confirmed)');
  ok(oldRow('Quick Trade: Party') === undefined, 'old lookup: section-qualified names find nothing (safe before the patch)');
}

// ---------------------------------------------------------------- 3) diff
{
  const rows = P.cfgParse(page({ qtParty: false, translit: true, noCarrier: 5, lang: 'Русский' })).rows;
  const d = P.cfgDiff(rows, { qtParty: true, translit: false, followTown: true, language: 'English', noCarrier: 0, blockExp: null, _note: 'x', bogus: true, qaMaster: 'yes' });
  eq(d.changes.map(c => [c.key, c.to, c.cmd]), [['qtParty', true, '0c'], ['translit', false, '01'], ['language', 'English', '00'], ['noCarrier', 0, '010 0']], 'diff: changes + commands');
  eq(d.same, ['followTown'], 'diff: same');
  eq(d.missing, ['bogus'], 'diff: missing key');
  eq(d.refused.map(x => x.key), ['qaMaster'], 'diff: non-boolean refused');
  const e = P.cfgDiff(P.cfgParse(page()).rows, { language: 'Deutsch', noCarrier: 99999 });
  eq(e.refused.map(x => x.key), ['language', 'noCarrier'], 'diff: impossible language / number refused');
  eq(P.cfgDiff(P.cfgParse(page()).rows, {}).changes.length, 0, 'diff: empty want');
}

// ---------------------------------------------------------------- 4) wanted values + auto gate
{
  const d = { want: { qtParty: true, blockExp: true, _x: 1, translit: false }, trial: { noTraders: true }, chars: { Bishop1: { qtParty: false, forwardDrop: true } }, autoApply: true };
  eq(P.cfgWantOf(d, 'Tank1', false), { qtParty: true, translit: false }, 'want: blockExp + _keys stripped');
  eq(P.cfgWantOf(d, 'Tank1', true), { qtParty: true, translit: false, noTraders: true }, 'want: + trial');
  eq(P.cfgWantOf(d, 'Bishop1', false), { qtParty: false, translit: false, forwardDrop: true }, 'want: per-character override');
  eq(P.cfgWantOf(null, 'X', true), {}, 'want: no defaults');
  const s = { name: 'Tank1', ready: true, dead: false, combat: false, busy: false, mode: 'autolevel', sinceReadyMs: 200000, sinceLastMs: null, sinceFailMs: null };
  eq(P.cfgAutoAllowed({ autoApply: false }, s), 'autoApply off', 'auto: off by default');
  eq(P.cfgAutoAllowed({}, s), 'autoApply off', 'auto: missing = off');
  eq(P.cfgAutoAllowed(d, s), '', 'auto: allowed');
  eq(P.cfgAutoAllowed(d, Object.assign({}, s, { sinceReadyMs: 5000 })), 'start delay', 'auto: start delay');
  eq(P.cfgAutoAllowed(d, Object.assign({}, s, { combat: true })), 'busy', 'auto: not in combat');
  eq(P.cfgAutoAllowed(d, Object.assign({}, s, { mode: 'raid' })), 'mode raid', 'auto: not in a raid');
  eq(P.cfgAutoAllowed(d, Object.assign({}, s, { mode: 'mission' })), 'mode mission', 'auto: not in a mission');
  eq(P.cfgAutoAllowed(d, Object.assign({}, s, { dead: true })), 'not ready', 'auto: not dead');
  eq(P.cfgAutoAllowed(d, Object.assign({}, s, { sinceLastMs: 3600e3 })), 'checked recently', 'auto: verifyHours');
  eq(P.cfgAutoAllowed(d, Object.assign({}, s, { sinceLastMs: 13 * 3600e3 })), '', 'auto: verify again after 12 h');
  eq(P.cfgAutoAllowed(d, Object.assign({}, s, { sinceFailMs: 60000 })), 'failed recently', 'auto: failure back-off');
  eq(P.cfgAutoAllowed(Object.assign({}, d, { onlyChars: ['Bishop1'] }), s), 'not in onlyChars', 'auto: onlyChars');
  eq(P.cfgAutoAllowed(Object.assign({}, d, { skipChars: ['Tank1'] }), s), 'in skipChars', 'auto: skipChars');
}

// ---------------------------------------------------------------- 5) server_cfg.json
{
  const fp = path.join(ROOT, 'Scripts', 'data', 'server_cfg.json');
  ok(fs.existsSync(fp), 'data: Scripts/data/server_cfg.json exists');
  const J = JSON.parse(fs.readFileSync(fp, 'utf8'));
  eq(J.botDefaults.autoApply, false, 'data: autoApply off by default');
  ok(!('blockExp' in J.botDefaults.want) && !('forwardDrop' in J.botDefaults.want), 'data: want never holds blockExp / forwardDrop');
  ok(Object.keys(J.botDefaults.want).every(k => ALLKEYS.includes(k)) && Object.keys(J.botDefaults.trial).every(k => ALLKEYS.includes(k)), 'data: want / trial keys are real rows');
  eq(J.options.map(o => o.key), ALLKEYS, 'data: one option per live row, page order');
  ok(J.options.every(o => o.what && o.src && o.rec && 'value' in o.rec && typeof o.rec.auto === 'boolean'), 'data: every option documented');
  const forum = ['.whoiam', '.cfg', '.repair', '.offline', '.lock', '.password', '.autohp', '.automp', '.autocp', '.hellbound', '.epic', '.exp', '.town', '.time / .date', '.clanwarehouse'];
  ok(forum.every(c => J.commands.some(x => x.cmd === c && /GUIDE/.test(x.src))), 'data: all 15 .help commands of the topic-60 screenshot');
  ok(J.commands.find(c => c.cmd === '.lock').rec.indexOf('NEVER') === 0 && J.commands.find(c => c.cmd === '.password').rec.indexOf('NEVER') === 0, 'data: .lock / .password marked NEVER');
  // the recommended auto values are already live on every captured character except Quick Trade: Party
  const W = P.cfgWantOf(J.botDefaults, '', false);
  Object.keys(W).forEach(k => { if (k === 'qtParty') return; const c = (J.options.find(o => o.key === k) || {}).liveCounts || {}; const v = W[k] === true ? 'On' : W[k] === false ? 'Off' : String(W[k]);
    ok(Object.keys(c).length === 0 || Object.keys(c).every(x => x === v), 'data: ' + k + ' is ' + v + ' on every captured character'); });
  ok(fs.existsSync(path.join(ROOT, 'docs', 'plan', 'server_cfg.md')), 'doc: docs/plan/server_cfg.md exists');
}

// ---------------------------------------------------------------- 6) dashboard suggestions
{
  const K = require(path.join(ROOT, 'Dashboard', 'commands.js'));
  const rows = P.cfgParse(page()).rows;
  ok(!K.CABINET.includes('Party') && !K.CABINET.includes('Master Account') && !K.CABINET.includes('Same IP'), 'dashboard: no ambiguous bare names in CABINET');
  K.CABINET.forEach(c => { const f = P.cfgFind(rows, c); ok(!!f.row && f.row.kind === 'toggle', 'dashboard: "' + c + '" resolves to exactly one On/Off row' + (f.err ? ' (' + f.err + ')' : '')); });
  const cab = K.COMMANDS.find(c => c.id === 'cabinet');
  eq(K.build(cab.tpl, { setting: 'Quick Trade: Party', on: 'on' }), '!cabinet Quick Trade: Party on', 'dashboard: built command');
  // swarm.js !cabinet splits: label = everything between the command and on|off
  const parts = '!cabinet Quick Trade: Party on'.split(/\s+/);
  eq(parts.slice(1, -1).join(' '), 'Quick Trade: Party', 'dashboard: !cabinet label survives the split');
}

// ---------------------------------------------------------------- 7) live captures (our own Logs/cabinet_*.html)
{
  const L = path.join(ROOT, 'Logs');
  const files = fs.existsSync(L) ? fs.readdirSync(L).filter(f => /^cabinet_(after_)?[^_]+\.html$/.test(f)) : [];
  let n = 0;
  files.forEach(f => {
    const r = P.cfgParse(fs.readFileSync(path.join(L, f), 'utf8'));
    if (!r.ok) return;   // an old capture of another page
    n++;
    ok(r.rows.map(x => x.key).join() === ALLKEYS.join(), 'live: ' + f + ' has the 17 known rows');
  });
  console.log('live captures parsed: ' + n + ' of ' + files.length);
}

// ---------------------------------------------------------------- 8) the swarm.js patch (copy only)
(function patchTests() {
  const cand = [process.env.PATCH, path.join(os.tmpdir(), 'claude', 'C--L2-L2Swarm', '9d69d83a-07bd-4424-92b7-5679277c4b38', 'scratchpad', 'patch_servercfg.js')].filter(Boolean);
  const patch = cand.find(p => fs.existsSync(p));
  const sw = path.join(ROOT, 'Scripts_dev', 'swarm.js');
  const pure = fs.readFileSync(path.join(__dirname, 'cfg_pure.js'), 'utf8');
  const block = (t) => { const a = t.indexOf('// ==== CFG-PURE begin'), b = t.indexOf('// ==== CFG-PURE end'); return a >= 0 && b > a ? t.slice(a, b) : null; };
  if (fs.existsSync(sw) && block(fs.readFileSync(sw, 'utf8'))) {
    eq(block(fs.readFileSync(sw, 'utf8')) === block(pure), true, 'swarm.js: CFG-PURE block identical to cfg_pure.js');
  } else if (patch && fs.existsSync(sw)) {
    const tmp = path.join(os.tmpdir(), 'swarm_cfgtest_' + process.pid + '.js');
    fs.copyFileSync(sw, tmp);
    try {
      const r1 = cp.spawnSync(process.execPath, [patch, tmp], { encoding: 'utf8' });
      eq(r1.status, 0, 'patch: applies to a copy (' + (r1.stderr || '').trim() + ')');
      const r2 = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
      eq(r2.status, 0, 'patch: node --check on the patched copy (' + (r2.stderr || '').trim().split('\n')[0] + ')');
      const r3 = cp.spawnSync(process.execPath, [patch, tmp], { encoding: 'utf8' });
      eq(r3.status, 2, 'patch: a second run refuses');
      const t = fs.readFileSync(tmp, 'utf8');
      eq(block(t) === block(pure), true, 'patch: CFG-PURE block copied verbatim');
      ok(/async function cabinetSet\(label, on\) \{\n  return cfgWithBoard/.test(t) && /async function cabinetSetOld\(label, on\)/.test(t), 'patch: new cabinetSet + old one renamed');
      ok((t.match(/async function cabinetSet\(/g) || []).length === 1, 'patch: exactly one cabinetSet');
      ok(t.indexOf("case '!cfg':") >= 0 && t.indexOf("case '!cfg':") < t.indexOf("case '!cabinet':"), 'patch: !cfg handler before !cabinet');
      ok(/setInterval\(\(\) => \{ cfgAutoTick\(\)/.test(t), 'patch: auto tick registered (gated by autoApply)');
      // the host part runs in a sandbox with stubs: cabinetSet sets Quick Trade: Party through the real page flow
      const host = t.slice(t.indexOf('// ==== CFG-PURE begin'), t.indexOf('/** OLD cabinetSet'));
      const vm = require('vm');
      let cur = { qtParty: false }; const clicks = [], notes = [], files = {};
      const ctx = { console, Date, JSON, Math, Object, Array, String, Number, RegExp, Promise, setInterval: () => 0,
        __SCRIPTS__: 'S', SWARM_ROOT: 'R', Me: { Name: 'Tester', IsDead: false }, state: { role: 'sk', mode: 'autolevel' }, tradeState: null, IsInCombat: false,
        inst: { on: false }, DLV: { on: false }, LVC: { busy: false }, IsCharacterReady: () => true, inRaid: () => false,
        now: () => Date.now(), sleep: () => Promise.resolve(), fileStamp: () => '1', logError: (w, e) => notes.push('ERR ' + w + ' ' + e),
        note: (m) => notes.push(m), savePage: () => { }, closeClientBoard: () => { },
        File: { ReadAllText: () => JSON.stringify({ botDefaults: { autoApply: false, want: { qtParty: true, followTown: true } } }), WriteAllText: (f, c) => { files[f] = c; } },
        boardPath: async () => page(cur),
        pageRequest: async (cmd) => { clicks.push(cmd); if (cmd === '0c') cur = Object.assign({}, cur, { qtParty: !cur.qtParty }); if (cmd === '07') cur = Object.assign({}, cur, { followDialog: false }); return page(cur); } };
      vm.createContext(ctx); vm.runInContext(host, ctx);
      (async () => {
        const a = await ctx.cabinetSet('Quick Trade: Party', true);
        eq([a.ok, clicks], [true, ['0c']], 'host: cabinetSet clicks 0c once and verifies On (' + a.msg + ')');
        const b = await ctx.cabinetSet('Party', true);
        eq([b.ok, /already On/.test(b.msg), clicks.length], [true, true, 1], 'host: "Party" already On = no click');
        const c = await ctx.cabinetSet('Master Account', false);
        eq([c.ok, /ambiguous/.test(c.msg), clicks.length], [false, true, 1], 'host: ambiguous name = nothing clicked');
        cur = { qtParty: false };
        const d = await ctx.cfgApply({ qtParty: true, followTown: true }, 'test');
        eq([d.ok, d.applied.length, clicks.slice(-1)[0]], [true, 1, '0c'], 'host: cfgApply sets only what differs');
        ok(/servercfg_Tester\.json/.test(Object.keys(files).join()), 'host: Logs/servercfg_<Name>.json written');
        const rec = JSON.parse(files['R\\Logs\\servercfg_Tester.json']);
        eq(rec.differs, [], 'host: record says nothing differs after apply');
        await ctx.cfgAutoTick();
        eq(clicks.length, 2, 'host: auto tick does nothing while autoApply is false');
        await ctx.cfgOrder(false);
        ok(notes.some(m => /^cfg: all 2 as wanted/.test(m)), 'host: !cfg report (' + notes.slice(-1)[0] + ')');
        done();
      })().catch(e => { ok(false, 'host sandbox threw: ' + (e && e.stack || e)); done(); });
      return;
    } finally { setTimeout(() => { try { fs.unlinkSync(tmp); } catch (e) { } }, 2000); }
  } else console.log('patch: not found / swarm.js missing -> patch tests skipped');
  done();
})();
function done() { if (done.d) return; done.d = 1; console.log(`test_cfg: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; }
