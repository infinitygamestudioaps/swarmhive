// CASTER XML COMBAT SKILLS -> the class's strongest nukes (CASTPRIO REAL POWER, owner 2026-10-13 21:00: "Spellhowlers are not using their most
// powerful skill either"). L2Swarm's own combat (FollowAtk + Settings/<file>.xml CombatSkillsList) casts ONLY the skills in that list. While
// swarm.js owns a member caster's attacks (CAST LOOP, l2sSkillGuard) it switches those entries OFF at runtime; in every gap (script / brain
// worker restart, "switched back ON" 7-19x a day per caster on 2026-10-13, leader casters, the script stopped) L2Swarm casts the XML list.
// The lists still held the 2026-10-09 picks (Spellhowlers 53: Twister 44 + Shadow Spark 55 instead of Hurricane 72; Spellsingers 42: Aqua
// Swirl 44 + Solar Spark instead of Hydro Blast 58; Human Wizards 22: Wind Strike instead of Blaze) and a mix of IsEnabled true/false (an
// L2Swarm save while the script had them switched off writes false into the XML).
//
// The plan per caster (role nuker / necromancer, class kind nuker or base mystic in caster_primary.json; healers, buffers, summoners and the
// kamael hybrids are left alone): entry 1 = the strongest KNOWN primary at its live level (datapack power, caster_primary.json pw), entry 2 =
// the next strongest single-target nuke with cast range >= 600 (no drain / Death Link / 5-min burst / debuff nukes), both IsEnabled=true.
// Live levels + MP come from Logs/swarm_state_<name>.json (ov.skills), written by swarm.js every few seconds.
//
//   node docs/plan/tools/caster_xml_update.js                      dry run: prints old -> new per account, writes nothing
//   node docs/plan/tools/caster_xml_update.js --apply --names Nuker7,Nuker8 [--gap 20000] [--force]
//
// --apply, per character, one at a time (never in parallel): refuses while a raid / Kamaloka is live (Logs/raid_live*.json, kamaloka_live.json
// < 60 s) or the character fights / is dead / HP < 70 % / its state file is older than 30 s (unless --force) -> MCP close_account (config_path)
// -> re-read the XML AFTER the close (L2Swarm may save on close) -> backup Settings/backup/castprio_2026-10-13/<file> -> replace ONLY the
// <CombatSkillsList> block (everything else byte-identical, checked; the <Password> line checked unchanged) -> Logs/castloop_l2s_off_<name>.json
// reset to {} -> MCP open_account config_path -> waits until swarm_state_<name>.json is fresh again (the brain / agent2 reattached; <= 150 s).
// Undo: copy the backup back with the account closed, then open it. The account id changes with close/open (MCP: re-read it).
'use strict';
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2), opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..', '..', '..')));
const MCP = opt('--mcp', 'http://127.0.0.1:8083');
const APPLY = A.includes('--apply'), FORCE = A.includes('--force');
const NAMES = (opt('--names', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const GAP = Math.max(20000, Number(opt('--gap', 20000)) || 20000);
const LOGS = path.join(ROOT, 'Logs'), SETTINGS = path.join(ROOT, 'Settings'), BACKUP = path.join(SETTINGS, 'backup', 'castprio_2026-10-13');
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
const say = (m) => console.log(m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const CP = readJ(path.join(ROOT, 'Scripts', 'data', 'caster_primary.json')) || {};
const CFG = readJ(path.join(ROOT, 'swarm.config.json')) || {};

// ---- the plan -----------------------------------------------------------------------------------------------------------------
const powAt = (r, lvl) => { const p = r.pw || [], l = Number(lvl) || 0; return !p.length || l <= 0 ? 0 : Number(p[l > 100 ? p.length - 1 : Math.min(l, p.length) - 1]) || 0; };
function planFor(name) {
  const st = readJ(path.join(LOGS, `swarm_state_${name}.json`)); if (!st) return { skip: 'no Logs/swarm_state file' };
  const meta = (CP._meta || {})[st.classId]; if (!meta) return { skip: `class ${st.classId} not a caster line` };
  if (!/^(nuker|base)$/.test(meta.kind)) return { skip: `${meta.name}: ${meta.kind} (left alone)` };
  const known = {}; ((st.ov && st.ov.skills) || []).forEach(k => { known[k.id] = k; });
  if (!Object.keys(known).length) return { skip: 'no live skill list in the state file' };
  const rows = (CP[st.classId] || []).filter(r => known[r.skillId] && !r.aoe && r.range >= 600 && (r.role === 'primary' || (r.role === 'fallback' && r.kind === 'nuke')))
    .map(r => ({ id: r.skillId, name: r.name, role: r.role, lvl: known[r.skillId].lvl, mp: known[r.skillId].mp, range: r.range, power: powAt(r, known[r.skillId].lvl), learn: r.learnLevel }));
  const prim = rows.filter(r => r.role === 'primary').sort((x, y) => y.power - x.power || y.learn - x.learn)[0];
  if (!prim) return { skip: 'no primary nuke learned' };
  const second = rows.filter(r => r !== prim).sort((x, y) => y.power - x.power || (y.power / Math.max(1, y.mp)) - (x.power / Math.max(1, x.mp)))[0] || null;
  return { cls: meta.name, level: st.level, entries: [prim].concat(second ? [second] : []), state: st };
}
// ---- XML -------------------------------------------------------------------------------------------------------------------------
function readXml(file) {
  const buf = fs.readFileSync(file);
  const u16 = buf[0] === 0xFF && buf[1] === 0xFE;
  return { u16, text: u16 ? buf.slice(2).toString('utf16le') : buf.toString('utf8') };
}
function writeXml(file, x, text) { fs.writeFileSync(file, x.u16 ? Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(text, 'utf16le')]) : Buffer.from(text, 'utf8')); }
function oldList(text) {
  const m = /<CombatSkillsList>([\s\S]*?)<\/CombatSkillsList>/.exec(text); if (!m) return null;
  return [...m[1].matchAll(/<CombatSkill\b[\s\S]*?<\/CombatSkill>/g)].map(e => ({ raw: e[0], id: Number((/<Id>(\d+)<\/Id>/.exec(e[0]) || [])[1]) || 0,
    name: (/<Name>([^<]*)<\/Name>/.exec(e[0]) || [])[1] || '', on: /<IsEnabled>true<\/IsEnabled>/.test(e[0]) }));
}
function newBlock(text, entries) {
  const m = /([ \t]*)<CombatSkillsList>([\s\S]*?)([ \t]*)<\/CombatSkillsList>/.exec(text); if (!m) throw new Error('no <CombatSkillsList> block');
  const items = oldList(text); if (!items || !items.length) throw new Error('empty CombatSkillsList: no entry to copy the format from');
  const nl = /\r\n/.test(text) ? '\r\n' : '\n', ind = (/^([ \t]*)<CombatSkill\b/m.exec(m[2]) || [, '    '])[1];
  const tpl = items[0].raw;
  const one = (e) => tpl.replace(/<Id>\d+<\/Id>/, `<Id>${e.id}</Id>`).replace(/<Name>[^<]*<\/Name>/, `<Name>${e.name}</Name>`)
    .replace(/<MP>\d+<\/MP>/, `<MP>${e.mp}</MP>`).replace(/<Range>\d+<\/Range>/, `<Range>${e.range}</Range>`)
    .replace(/(<\/Skill>\s*<IsEnabled>)(true|false)(<\/IsEnabled>)/, '$1true$3');
  const body = entries.map(e => ind + one(e)).join(nl);
  const block = `${m[1]}<CombatSkillsList>${nl}${body}${nl}${m[3]}</CombatSkillsList>`;
  const out = text.slice(0, m.index) + block + text.slice(m.index + m[0].length);
  // safety: everything outside the block identical, the password line untouched
  const pw = (t) => (/<Password>[^<]*<\/Password>/.exec(t) || [''])[0];
  if (out.slice(0, m.index) !== text.slice(0, m.index) || out.slice(m.index + block.length) !== text.slice(m.index + m[0].length) || pw(out) !== pw(text)) throw new Error('safety check failed (text outside the block / password changed)');
  return out;
}
// ---- MCP (same client as attach_agent.js) ------------------------------------------------------------------------------------
let sid = null, inited = false;
function rpc(body) {
  return new Promise((res, rej) => {
    const u = new URL(MCP), data = Buffer.from(JSON.stringify(body));
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': data.length, Connection: 'close' }; if (sid) headers['Mcp-Session-Id'] = sid;
    const rq = require('http').request({ host: u.hostname, port: u.port || 80, path: u.pathname || '/', method: 'POST', headers, agent: false }, (r) => {
      const s = r.headers['mcp-session-id']; if (s) sid = s;
      let t = ''; r.setEncoding('utf8'); r.on('data', d => t += d);
      r.on('end', () => { if (/^\s*(event|data):/.test(t)) t = t.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join(''); try { res(JSON.parse(t)); } catch (e) { rej(new Error('MCP answer is not JSON: ' + t.slice(0, 200))); } });
    });
    rq.on('error', rej); rq.setTimeout(60000, () => rq.destroy(new Error('MCP timeout'))); rq.end(data);
  });
}
async function mcp(tool, args) {
  if (!inited) { await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'caster-xml-update', version: '1' } } }); inited = true; }
  const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } });
  const c = r && r.result && r.result.content, t = c && c[0] ? c[0].text : JSON.stringify(r);
  if (r && r.result && r.result.isError) throw new Error(`${tool}: ${t}`);
  try { return JSON.parse(t); } catch (e) { return { text: t }; }
}
function liveFight() {
  const t = Date.now(), out = [];
  let files = []; try { files = fs.readdirSync(LOGS).filter(f => /^raid_live.*\.json$/i.test(f) || /^kamaloka_live\.json$/i.test(f)); } catch (e) { }
  for (const f of files) { try { if (t - fs.statSync(path.join(LOGS, f)).mtimeMs < 60000) out.push(f); } catch (e) { } }
  return out;
}
function readyToClose(name) {
  const st = readJ(path.join(LOGS, `swarm_state_${name}.json`)); if (!st) return 'no state file';
  const age = Date.now() - Date.parse(st.updated || 0);
  if (!(age < 30000)) return `state file ${Math.round(age / 1000)} s old (not running?)`;
  if (st.dead) return 'dead'; if (st.combat) return 'in combat'; if (Number(st.hp) < 70) return `HP ${st.hp} %`;
  return '';
}
// ---- main --------------------------------------------------------------------------------------------------------------------
(async () => {
  const accs = (CFG.accounts || []).filter(a => a.character && a.config);
  const want = NAMES.length ? accs.filter(a => NAMES.includes(a.character)) : accs;
  if (NAMES.length && want.length !== NAMES.length) say(`unknown character(s): ${NAMES.filter(n => !want.some(a => a.character === n)).join(', ')}`);
  const todo = [];
  for (const acc of want) {
    const p = planFor(acc.character); if (p.skip) { if (NAMES.length) say(`${acc.character}: skipped — ${p.skip}`); continue; }
    const file = path.join(SETTINGS, acc.config); if (!fs.existsSync(file)) { say(`${acc.character}: ${acc.config} missing`); continue; }
    const x = readXml(file), old = oldList(x.text) || [];
    const same = old.length === p.entries.length && old.every((o, i) => o.id === p.entries[i].id && o.on);
    say(`${acc.character.padEnd(11)} ${acc.config.padEnd(16)} ${p.cls} ${p.level}: ${old.map(o => `${o.name} ${o.id} ${o.on ? 'on' : 'OFF'}`).join(' + ') || '(empty)'}  ->  ` +
      `${p.entries.map(e => `${e.name} ${e.id} (L${e.lvl}, power ${e.power}, ${e.mp} MP, ${e.range})`).join(' + ')}${same ? '  [already so]' : ''}`);
    if (!same && old.length) todo.push({ acc, file, plan: p });
  }
  if (!APPLY) { say(`\ndry run: ${todo.length} account(s) would change. Apply one by one: --apply --names <Char>[,<Char>] (L2Swarm + dashboard running, no raid).`); return; }
  if (!NAMES.length) { say('--apply needs --names (one or a few characters at a time)'); process.exitCode = 1; return; }
  fs.mkdirSync(BACKUP, { recursive: true });
  for (let i = 0; i < todo.length; i++) {
    const { acc, file, plan } = todo[i], name = acc.character;
    const lf = liveFight(); if (lf.length && !FORCE) { say(`STOP: a fight is live (${lf.join(', ')}) — nothing more changed`); process.exitCode = 1; return; }
    let why = readyToClose(name), w0 = Date.now();
    while (why && !FORCE && Date.now() - w0 < 120000) { say(`${name}: waiting (${why})`); await sleep(5000); why = readyToClose(name); }
    if (why && !FORCE) { say(`${name}: skipped (${why})`); continue; }
    say(`${name}: close_account`);
    await mcp('close_account', { config_path: file });
    await sleep(3000);
    const x = readXml(file);                                              // after the close: L2Swarm may have saved it
    const bk = path.join(BACKUP, acc.config); if (!fs.existsSync(bk)) fs.copyFileSync(file, bk);
    try { writeXml(file, x, newBlock(x.text, plan.entries)); } catch (e) { say(`${name}: NOT changed (${e.message}) — opening it again`); }
    try { fs.writeFileSync(path.join(LOGS, `castloop_l2s_off_${name}.json`), '{}'); } catch (e) { }
    const t0 = Date.now();
    say(`${name}: open_account`);
    await mcp('open_account', { config_path: file });
    let ok = false; while (Date.now() - t0 < 150000) { await sleep(5000); const st = readJ(path.join(LOGS, `swarm_state_${name}.json`)); if (st && Date.parse(st.updated || 0) > t0 + 5000) { ok = true; break; } }
    const now = oldList(readXml(file).text) || [];
    say(`${name}: ${ok ? 'back (swarm_state fresh)' : 'NOT reporting after 150 s — check it'}; XML list now ${now.map(o => `${o.name} ${o.on ? 'on' : 'OFF'}`).join(' + ')}; backup ${path.relative(ROOT, bk)}`);
    if (i < todo.length - 1) await sleep(GAP);
  }
})().catch(e => { console.error('ERROR', e.message); process.exitCode = 1; });
