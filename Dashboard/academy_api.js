// ACADEMY MANAGER (owner 2026-10-21, ACADEMY-2026-10-21; guide docs/guide/pages/academy.md). Runs in the dashboard server every 30 s and
// does the parts of the academy pipeline a bot window cannot do itself:
//   setup   a new academy character (added on the dashboard as "Academy mage (automatic)", or the next one of an account): its approved class
//           plan (academy.json classPlan, approved by the owner's pipeline order), its party plan (Dashboard/academy_logic.js academyPlan), its
//           name in the clan invite list (clan_quests.json clan.inviteAllow) and its run switch ON (+ !start) — the owner asked for all of it
//   rename  the create script had to take another name (the first was taken): swarm.config.json + Settings/<Login>.xml follow it (close -> edit -> open)
//   next    the character graduated (Logs/academy_<Name>.json status 'graduated', written by swarm.js): close the account, a new random name,
//           the one-off create script again, swarm.config.json + the XML point at it, open the account (until the account's slots are full)
//   logout  academy.json end.newCharacter false: only close the account
// Never touches other accounts. One account action per tick. State: Logs/academy_manager.json, log: Logs/academy.log.
//   GET  /api/academy                  { ok, cfg, accounts: [{ login, character, status, decision, made, stopped }] }
//   POST /api/academy { action: 'stop' | 'resume', login }   stop / resume the loop for one account
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const AL = require('./academy_logic');
const STATE = { busy: false, last: {} };
const P = (ctx) => ({ data: ctx.DATA || path.join(ctx.ROOT, 'Scripts', 'data'), logs: ctx.LOGS || path.join(ctx.ROOT, 'Logs'), settings: ctx.SETTINGS || path.join(ctx.ROOT, 'Settings'), cfg: ctx.CONFIG_FILE || path.join(ctx.ROOT, 'swarm.config.json') });
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const iso = () => new Date().toISOString();
function log(ctx, msg) { try { fs.appendFileSync(path.join(P(ctx).logs, 'academy.log'), `${iso()} [manager] ${msg}\r\n`); } catch (e) { } }
function writeAtomic(f, text) { const tmp = f + '.academy.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); }
const mgrFile = (ctx) => path.join(P(ctx).logs, 'academy_manager.json');
function mgrRead(ctx) { const j = readJ(mgrFile(ctx), {}); j.accounts = j.accounts && typeof j.accounts === 'object' ? j.accounts : {}; return j; }
function mgrSave(ctx, j) { j.at = iso(); try { writeAtomic(mgrFile(ctx), JSON.stringify(j, null, 1)); } catch (e) { log(ctx, 'state write failed: ' + e.message); } }
const cfgOf = (ctx) => AL.academyCfg(readJ(path.join(P(ctx).data, 'academy.json'), {}));
function rosterRaw(ctx) { try { return fs.readFileSync(P(ctx).cfg, 'utf8'); } catch (e) { return ''; } }
function academyAccounts(ctx) { const raw = rosterRaw(ctx); let j = null; try { j = JSON.parse(raw.replace(/^﻿/, '')); } catch (e) { return []; } return (j.accounts || []).filter(a => a && a.academyMage);   /* ACADEMYFIELD-2026-10-21: only the automatic pipeline (accounts[].academy alone = an academy invite, e.g. the Flyt characters) */ }

/** swarm.config.json: one account's character (+ party when it led itself) -> the new name; keeps the file's layout as far as JSON allows */
function rosterRename(ctx, login, oldName, newName) {
  const F = P(ctx).cfg, raw = rosterRaw(ctx), bom = raw.charCodeAt(0) === 0xFEFF, j = JSON.parse(raw.replace(/^﻿/, ''));
  const a = (j.accounts || []).find(x => x && String(x.login).toLowerCase() === String(login).toLowerCase());
  if (!a) throw new Error(`login ${login} is not in swarm.config.json`);
  const H = path.join(P(ctx).settings, 'backup', 'swarm_config_history'); fs.mkdirSync(H, { recursive: true });
  fs.writeFileSync(path.join(H, 'swarm.config.' + iso().replace(/[:.]/g, '-') + '.academy.json'), raw);
  a.character = newName; if (!a.party || a.party === oldName) a.party = newName;
  // ACADGROUP-2026-11-02: a group leader's next character keeps leading its group - the members follow the new name
  (j.accounts || []).forEach(x => { if (x && x !== a && String(x.party || '') === String(oldName)) x.party = newName; });
  a.note = `academy character ${newName} (${iso().slice(0, 10)}; before: ${oldName})`;
  // keep the one-line style of the accounts list when the file used it
  let txt = JSON.stringify(j, null, 2);
  if (/\n\s*\{ "login"/.test(raw)) { txt = txt.replace(/\{\n\s+"login"[\s\S]*?\n\s+\}/g, (m) => { try { const o = JSON.parse(m); return '{ ' + Object.keys(o).map(k => JSON.stringify(k) + ': ' + JSON.stringify(o[k])).join(', ') + ' }'; } catch (e) { return m; } }); }
  JSON.parse(txt);
  writeAtomic(F, (bom ? '﻿' : '') + txt.replace(/\n/g, /\r\n/.test(raw) ? '\r\n' : '\n'));
  if (typeof ctx.reloadCfg === 'function') try { ctx.reloadCfg(); } catch (e) { }
}
/** Settings/<file>.xml: SelectedCharacter (+ the create script on) — only while the account is closed */
function xmlPoint(ctx, file, name, mkFile) {
  const F = path.join(P(ctx).settings, file); if (!fs.existsSync(F)) throw new Error(`Settings\\${file} not found`);
  const buf = fs.readFileSync(F), u16 = buf[0] === 0xFF && buf[1] === 0xFE, enc = u16 ? 'utf16le' : 'utf8';
  const B = path.join(P(ctx).settings, 'backup'); fs.mkdirSync(B, { recursive: true }); fs.writeFileSync(path.join(B, file.replace(/\.xml$/i, '') + '.academy_' + Date.now() + '.xml'), buf);
  let t = buf.toString(enc); if (u16 && t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  t = AL.xmlSetSelected(t, name);
  if (mkFile) t = AL.xmlEnsureScript(t, mkFile, path.join(ctx.ROOT, 'Scripts', mkFile), crypto.randomUUID());
  const out = u16 ? Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(t, 'utf16le')]) : Buffer.from(t, 'utf8');
  const tmp = F + '.academy.tmp'; fs.writeFileSync(tmp, out); fs.renameSync(tmp, F);
}
/** RECREATE2-2026-11-03: is the create script already in the account's ScriptsList (then a rewrite of the file is enough) */
function xmlHasScript(ctx, file, mkFile) {
  try { const F = path.join(P(ctx).settings, file || ''), buf = fs.readFileSync(F), t = buf.toString(buf[0] === 0xFF && buf[1] === 0xFE ? 'utf16le' : 'utf8'); return !!mkFile && t.indexOf(mkFile) >= 0; } catch (e) { return false; }
}
async function mcp(ctx, tool, args, ms) {
  if (typeof ctx.mcpCall !== 'function') throw new Error('no L2Swarm connection (mcpCall)');
  let t; try { return String(await Promise.race([Promise.resolve(ctx.mcpCall(tool, args)), new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms || 30000); })]) || ''); } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------------------------------------------------------------------- actions
/** ACADGROUP-2026-11-02 pure: acc (its swarm.config row), all academy accounts, cfg -> { member: true when it follows another group leader,
 *  index: its group's index when it LEADS a group (groups on), else -1 } */
function acadSetupRole(acc, accs, C) {
  const name = String(acc && acc.character || ''), party = String(acc && acc.party || name);
  if (party && party !== name) return { member: true, index: -1 };
  if (!C || !C.groups || !C.groups.on) return { member: false, index: -1 };
  // ACADREPEAT-2026-11-03: the group SYNC (groupSync below, every tick before the setups) decides who leads - a character leading its own key
  // in a group is that group's leader, whatever its login position (the next generation's first re-created character may lead)
  const g = AL.academyGroupOf(accs, acc && acc.login, C.groups.size);
  return { member: false, index: g ? g.index : -1 };
}
async function doSetup(ctx, acc, C) {
  const name = String(acc.character), by = 'academy pipeline (owner 2026-10-21)', out = [];
  if (typeof ctx.reloadCfg === 'function') try { ctx.reloadCfg(); } catch (e) { }
  try {   // 1) the approved class plan (the owner's pipeline order = the approval)
    // ACADCLASSPARTY-2026-11-03 (live: "class plan FAILED: no party Zarael0158" - a group member's party is its LEADER's key, so the approval failed and
    // the new generation would never change class): the class plan goes under the party the character is in
    const cpParty = String(acc.party || name);
    const r = await require('./classpage_api').post(ctx, { action: 'set', leader: cpParty, name, plan: C.classPlan, approve: true, confirm: true, by, note: 'academy mage (Dark Elven Mystic -> Dark Wizard -> Spellhowler)' });
    out.push('class plan ' + (r && r.ok ? 'approved' : 'FAILED: ' + (r && r.error)));
  } catch (e) { out.push('class plan FAILED: ' + e.message); }
  // ACADGROUP-2026-11-02: a member of an academy group (its party = the group leader) gets no party plan / run switch / party switches of its own -
  // the group leader's plan runs it; a group leader gets the GROUP plan (its own Cruma room)
  const grp = acadSetupRole(acc, academyAccounts(ctx), C);
  if (grp.member) { out.push(`group member of ${acc.party}: the group plan runs it (no own party plan / run switch)`); }
  if (!grp.member) try {   // 2) the party plan (on = used on Start)
    const r = await require('./partyplan_api').post(ctx, { action: 'set', party: name, plan: AL.academyPlan(C, name, grp.index), by });
    out.push('party plan ' + (r && r.ok ? 'set' : 'FAILED: ' + (r && r.error)) + (grp.index >= 0 ? ` (group ${grp.index + 1})` : ''));
  } catch (e) { out.push('party plan FAILED: ' + e.message); }
  try {   // 3) the clan leader may invite it (into the Academy: swarm.config.json academy: true)
    const CQF = path.join(P(ctx).data, 'clan_quests.json'), cq = readJ(CQF, {}); cq.clan = cq.clan || {};
    const a = new Set((cq.clan.inviteAllow || []).map(String)); if (!a.has(name)) { a.add(name); cq.clan.inviteAllow = [...a].sort(); try { fs.copyFileSync(CQF, path.join(P(ctx).settings, 'backup', 'clan_quests_' + Date.now() + '.json')); } catch (e) { } writeAtomic(CQF, JSON.stringify(cq, null, 2)); }
    out.push('invite list OK');
  } catch (e) { out.push('invite list FAILED: ' + e.message); }
  if (!grp.member) try {   // 4) run switch ON (+ !start when it is online; else it starts the plan at its login)
    const r = await require('./runstate_api').post(ctx, { party: name, on: true, by, send: true });
    out.push('run switch ' + (r && r.ok ? 'ON' : 'FAILED: ' + (r && r.error)));
  } catch (e) { out.push('run switch FAILED: ' + e.message); }
  if (!grp.member) try {   // 5) ACADSTORE-2026-10-31 (owner: "level as fast as possible ... make sure you have spiritshots and full buffs. Also take 'Magnus Chant'
          //    from giran"): its own party switches: supply watch (shots topped up when low) + the Giran store buffs (Magnus' Chant / Chant of Victory)
    const PF = path.join(P(ctx).data, 'party_auto.json'), pa = readJ(PF, null);
    if (pa && typeof pa === 'object') {
      pa.parties = pa.parties && typeof pa.parties === 'object' ? pa.parties : {};
      const cur = pa.parties[name] || {}, want = { supplyWatch: true, sell: true, storeMagnus: !!(C.buffs.on && C.buffs.magnus), storeCov: !!(C.buffs.on && C.buffs.cov) };
      if (Object.keys(want).some(k => cur[k] !== want[k])) { pa.parties[name] = Object.assign({}, cur, want); writeAtomic(PF, JSON.stringify(pa, null, 1)); }
      out.push(`party switches: supply watch ON, Magnus ${want.storeMagnus ? 'ON' : 'off'}, COV ${want.storeCov ? 'ON' : 'off'}`);
    } else out.push('party switches: Scripts/data/party_auto.json missing');
  } catch (e) { out.push('party switches FAILED: ' + e.message); }
  return out;
}
/** a fresh name list + the create script for the next character of this account */
function makeCreate(ctx, acc, C, taken, del, keep) {   // del: ACADLOOP-2026-10-31, ONLY AL.academyDeleteList (pipeline-made graduates)
  const AA = require('./addaccount_api');
  // RECREATE2-2026-11-03: keep = a re-try keeps its name (first in the list; the rest only when the server refuses it)
  let names = AL.academyNames(C, ctx.rnd || Math.random, taken, Number(C.names.tries) || 6);
  if (keep) names = [String(keep)].concat(names.filter(n => String(n).toLowerCase() !== String(keep).toLowerCase())).slice(0, Math.max(2, names.length));
  const classes = AA.baseClasses(ctx), cls = classes.find(c => c.id === Number(C.classId)) || { race: C.race, id: C.classId, type: 'mystic' };
  const sexes = (C.sexes || [0, 1]).filter(s => !cls.gender || (cls.gender === 'M' ? s === 0 : s === 1));
  const sex = sexes.length ? sexes[Math.floor((ctx.rnd || Math.random)() * sexes.length) % sexes.length] : 0;
  const mk = 'mkchar_' + String(acc.login).toLowerCase() + '.js';
  const rootFwd = String(ctx.ROOT).replace(/\\/g, '/');
  const stats = AA.BASE_STATS[cls.id] || AA.BASE_STATS[10];
  fs.writeFileSync(path.join(ctx.ROOT, 'Scripts', mk), AA.buildCreateScript(rootFwd, String(acc.login).toLowerCase(), { race: cls.race, sex, classId: cls.id, stats, names, resultFile: 'Logs/academy_create_' + String(acc.login).toLowerCase() + '.json', del: Array.isArray(del) ? del : [] }, names[0]));
  return { names, mk };
}
/** RECREATE-2026-11-03: pure - brain_host.json "allow" list with the graduate replaced by its account's next character (allowAll lists stay) */
function bhAllowRename(bh, oldName, newName) {
  if (!bh || bh.allowAll === true || !Array.isArray(bh.allow) || !newName || oldName === newName) return null;
  const L = bh.allow.map(String), i = L.indexOf(String(oldName));
  if (i < 0 && L.includes(String(newName))) return null;
  const out = L.filter(n => n !== String(oldName) && n !== String(newName)); out.splice(i < 0 ? out.length : Math.min(i, out.length), 0, String(newName));
  return Object.assign({}, bh, { allow: out });
}
function bhRename(ctx, oldName, newName) {   // the brain host drives only the characters on its list: the next academy character takes the graduate's place
  const F = path.join(ctx.DATA || path.join(ctx.ROOT, 'Scripts', 'data'), 'brain_host.json'); if (!fs.existsSync(F)) return;
  const raw = fs.readFileSync(F, 'utf8'), j = JSON.parse(raw.replace(/^﻿/, '')), nj = bhAllowRename(j, oldName, newName); if (!nj) return;
  const B = path.join(P(ctx).settings, 'backup'); fs.mkdirSync(B, { recursive: true }); fs.writeFileSync(path.join(B, 'brain_host.academy_' + Date.now() + '.json'), raw);
  nj._updated = iso(); writeAtomic(F, JSON.stringify(nj, null, 2)); log(ctx, `brain_host.json: ${oldName} -> ${newName} (allow list)`);
}
async function reopenAs(ctx, acc, newName, mkFile) {
  const cfgPath = path.join(P(ctx).settings, acc.config || '');
  try { await mcp(ctx, 'close_account', { config_path: cfgPath }, 30000); } catch (e) { log(ctx, `${acc.login}: close_account: ${e.message} (going on)`); }
  await new Promise(r => setTimeout(r, ctx.closeWaitMs != null ? ctx.closeWaitMs : 5000));
  xmlPoint(ctx, acc.config, newName, mkFile);
  rosterRename(ctx, acc.login, acc.character, newName);
  try { bhRename(ctx, acc.character, newName); } catch (e) { log(ctx, `brain_host.json rename ${acc.character} -> ${newName} failed: ${e.message}`); }   // RECREATE-2026-11-03
  let out = ''; try { out = await mcp(ctx, 'open_account', { config_path: cfgPath }, 30000); } catch (e) { out = 'error: ' + e.message; }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------- group sync
// ACADREPEAT-2026-11-03 (owner: "it can be run over and over again"): the manager keeps the academy groups right by itself every tick - what was
// done by hand on 2026-11-02/03 (acad_groups_on.js party moves + group plans, switching the members' old solo party keys off): every
// not-graduated character of a group is in its leader's party, a NEW leader (the next generation's first re-created character, or the next one
// when the leader's account is stuck) gets the group plan, the old leader's party settings and its run switch, the members never own an ON key.
function rosterWriteObj(ctx, j, why) {
  const F = P(ctx).cfg, raw = rosterRaw(ctx), bom = raw.charCodeAt(0) === 0xFEFF;
  const H = path.join(P(ctx).settings, 'backup', 'swarm_config_history'); fs.mkdirSync(H, { recursive: true });
  fs.writeFileSync(path.join(H, 'swarm.config.' + iso().replace(/[:.]/g, '-') + '.academy_group.json'), raw);
  let txt = JSON.stringify(j, null, 2);
  if (/\n\s*\{ "login"/.test(raw)) { txt = txt.replace(/\{\n\s+"login"[\s\S]*?\n\s+\}/g, (m) => { try { const o = JSON.parse(m); return '{ ' + Object.keys(o).map(k => JSON.stringify(k) + ': ' + JSON.stringify(o[k])).join(', ') + ' }'; } catch (e) { return m; } }); }
  JSON.parse(txt);
  writeAtomic(F, (bom ? '﻿' : '') + txt.replace(/\n/g, /\r\n/.test(raw) ? '\r\n' : '\n'));
  if (typeof ctx.reloadCfg === 'function') try { ctx.reloadCfg(); } catch (e) { }
  log(ctx, `group sync: ${why}`);
}
/** a new group leader takes over: the group plan, the old leader's party settings (never over its own), its run switch ON, the old key OFF */
async function leaderTakeOver(ctx, C, r, by) {
  const out = [];
  try { const PM = require('./partymove_api');
    PM.PARTY_FILES.forEach(([file, where]) => { const F = path.join(P(ctx).data, file), j = readJ(F, null); if (!j || !r.prev) return; const o = where === 'top' ? j : (j[where] = j[where] || {});
      if (o[r.prev] === undefined || o[r.leader] !== undefined) return; o[r.leader] = JSON.parse(JSON.stringify(o[r.prev])); writeAtomic(F, JSON.stringify(j, null, file === 'party_auto.json' ? 1 : 2)); out.push(`${file}: ${r.prev} -> ${r.leader}`); });
  } catch (e) { out.push('settings copy FAILED: ' + e.message); }
  try { const pp = readJ(path.join(P(ctx).data, 'party_plans.json'), {}), have = ((pp.parties || pp.plans || {})[r.leader]) || null;
    if (!have || have.template !== 'academy') { const x = await require('./partyplan_api').post(ctx, { action: 'set', party: r.leader, plan: AL.academyPlan(C, r.leader, r.index), by }); out.push('group plan ' + (x && x.ok ? 'set' : 'FAILED: ' + (x && x.error))); }
  } catch (e) { out.push('group plan FAILED: ' + e.message); }
  try { const x = await require('./runstate_api').post(ctx, { party: r.leader, on: true, by, send: true }); out.push('run switch ' + (x && x.ok ? 'ON' : 'FAILED')); } catch (e) { out.push('run switch FAILED: ' + e.message); }
  if (r.prev && r.prev !== r.leader) try { await require('./runstate_api').post(ctx, { party: r.prev, on: false, by, send: false }); out.push(`old key ${r.prev} OFF`); } catch (e) { }
  return out;
}
async function groupSync(ctx, M, C) {
  if (!C.groups || !C.groups.on) return [];
  let j; try { j = JSON.parse(rosterRaw(ctx).replace(/^﻿/, '')); } catch (e) { return []; }
  const accs = (j.accounts || []).filter(a => a && a.academyMage && a.enabled !== false), by = 'academy pipeline (group sync, ACADREPEAT)', did = [];
  const graduated = (n) => { const s = readJ(path.join(P(ctx).logs, `academy_${n}.json`), null); return !!(s && s.status === 'graduated' && s.name === n); };
  const ready = (login, n) => { const D = M.accounts[login] || {}; return D.setupFor === n && !graduated(n); };
  M.groups = M.groups && typeof M.groups === 'object' ? M.groups : {};
  const sticky = {}; Object.keys(M.groups).forEach(k => { if (M.groups[k] && M.groups[k].leader) sticky[k] = M.groups[k].leader; });
  const res = AL.academyGroupSync(accs, C.groups.size, ready, graduated, sticky);
  const ap = AL.academyApplyMoves(j, [].concat(...res.map(r => r.moves)));
  if (ap.changed.length) { rosterWriteObj(ctx, ap.cfg, ap.changed.join('; ')); did.push(...ap.changed); }
  const rs = readJ(path.join(P(ctx).data, 'run_state.json'), {}), RP = (rs && rs.parties) || {};
  for (const r of res) {
    if (!r.leader) continue;
    const old = M.groups[r.index] || {};
    M.groups[r.index] = { leader: r.leader, since: old.leader === r.leader ? old.since : iso() };
    if (r.newLeader) { const t = await leaderTakeOver(ctx, C, r, by); log(ctx, `group ${r.index + 1}: ${r.leader} leads now (was ${r.prev}) - ${t.join('; ')}`); did.push(`group ${r.index + 1} leader ${r.leader}`); }
    // the members never own an ON party key (their old solo plans resumed on 2026-11-03)
    const g = AL.academyGroups(accs, C.groups.size)[r.index]; if (!g) continue;
    for (const m of g.members) { if (m === r.leader || graduated(m)) continue; if (RP[m] && RP[m].on === true) { try { await require('./runstate_api').post(ctx, { party: m, on: false, by, send: false }); did.push(`${m}: own party key OFF`); } catch (e) { } } }
  }
  return did;
}

// ---------------------------------------------------------------------------------------------------------------------------- tick
async function tick(ctx) {
  if (STATE.busy) return { skipped: 'busy' };
  STATE.busy = true;
  const M = mgrRead(ctx), C = cfgOf(ctx), acted = [];
  try {
    try { const g = await groupSync(ctx, M, C); if (g.length) log(ctx, 'group sync: ' + g.join('; ')); } catch (e) { log(ctx, 'group sync error: ' + (e && e.message || e)); }   // ACADREPEAT-2026-11-03
    const accs = academyAccounts(ctx);
    const taken = new Set(); (() => { try { JSON.parse(rosterRaw(ctx).replace(/^﻿/, '')).accounts.forEach(a => a && a.character && taken.add(String(a.character).toLowerCase())); } catch (e) { } })();
    for (const acc of accs) {
      const login = String(acc.login).toLowerCase(), D = M.accounts[login] = M.accounts[login] || { made: 1 };
      const st = readJ(path.join(P(ctx).logs, `academy_${acc.character}.json`), null), cr = readJ(path.join(P(ctx).logs, `academy_create_${login}.json`), null);
      // ACADLOOP-2026-10-31: what the create script marked for deletion (or found gone) never goes on a delete list again
      if (cr && Array.isArray(cr.deleted) && cr.deleted.length) { const s = new Set((D.deleted || []).map(String)); cr.deleted.forEach(n => s.add(String(n))); D.deleted = [...s].slice(-200); }
      if (cr && Array.isArray(cr.delFailed) && cr.delFailed.length) D.delFailed = cr.delFailed.slice(-20);
      const dec = AL.academyDecide(acc, st, cr, D, C);
      D.decision = dec.act; D.why = dec.why; D.character = acc.character;
      if (dec.act === 'wait' || dec.act === 'none') continue;
      // GROUPGRAD-2026-11-04 (owner: all toons of a group reach level 40 before the group starts new characters): a graduate waits for its group
      if (dec.act === 'next' && C.groups && C.groups.on) {
        try {
          const G = AL.academyGroups(accs, C.groups.size).find(g => g.logins.map(x => String(x).toLowerCase()).includes(login));
          if (G) {
            const gradL = (l) => { const a = accs.find(x => String(x.login).toLowerCase() === l); return !!(a && (() => { const s = readJ(path.join(P(ctx).logs, `academy_${a.character}.json`), null); return s && s.status === 'graduated' && s.name === a.character; })()); };
            const madeL = (l) => (M.accounts[l] && M.accounts[l].made) || 1;
            const gr = AL.academyGroupReady(G.logins.map(x => String(x).toLowerCase()), login, gradL, madeL);
            if (!gr.ready) { D.decision = 'wait'; D.why = `graduated - waiting until the whole group is level 40 (still: ${gr.waitFor.join(', ')})`; continue; }
          }
        } catch (e) { log(ctx, 'group graduation check: ' + (e && e.message || e)); }
      }
      if (acted.length) continue;                                         // one account action per tick
      if (dec.act === 'setup') {
        const r = await doSetup(ctx, acc, C); D.setupFor = String(acc.character); D.setupAt = iso(); D.setupResult = r.join('; ');
        D.madeNames = [...new Set((D.madeNames || []).concat([String(acc.character)]))].slice(-200);   // ACADLOOP-2026-10-31: made by the pipeline = may be deleted after graduating
        log(ctx, `${login}/${acc.character}: setup — ${D.setupResult}`); acted.push(login);
      } else if (dec.act === 'rename') {
        log(ctx, `${login}: ${dec.why} — swarm.config.json + Settings\\${acc.config} follow`);
        const out = await reopenAs(ctx, acc, dec.name, null);
        D.renamed = (D.renamed || []).concat([{ from: acc.character, to: dec.name, at: iso() }]).slice(-10); D.setupFor = '';
        log(ctx, `${login}: now ${dec.name} (open_account: ${out.replace(/\s+/g, ' ').slice(0, 120)})`); acted.push(login);
      } else if (dec.act === 'next') {
        const old = String(acc.character);
        D.history = (D.history || []).concat([{ graduated: old, at: iso() }]).slice(-200);   // ACADLOOP-2026-10-31: kept long (the delete list reads it)
        const del = AL.academyDeleteList(D, C, []);
        const { names, mk } = makeCreate(ctx, acc, C, taken, del);
        try { fs.unlinkSync(path.join(P(ctx).logs, `academy_create_${login}.json`)); } catch (e) { }
        const out = await reopenAs(ctx, acc, names[0], mk);
        D.made = (Number(D.made) || 1) + 1; D.setupFor = ''; D.createAt = iso(); D.retries = 0; delete D.forceRetry;   // RECREATE-2026-11-03
        log(ctx, `${login}: ${old} graduated — next academy character ${names[0]} (try names ${names.join(', ')}; character ${D.made} on this account; ${del.length ? 'marking for deletion: ' + del.join(', ') : 'nothing to delete'}; open_account: ${out.replace(/\s+/g, ' ').slice(0, 120)})`); acted.push(login);
      } else if (dec.act === 'retry') {   // ACADLOOP-2026-10-31: the slots were full (graduates still in their deletion timer): try again
        const del = AL.academyDeleteList(D, C, []);
        // RECREATE2-2026-11-03 (live: every ~2 min a NEW name - Shadora6413 -> Ashael07 -> Shadra2793 - and swarm.config.json rewritten each time):
        // the re-try keeps its name unless the server refused it; the same name + an open account = only the create script is rewritten (L2Swarm
        // reloads an attached script by itself), no close / open, no config / brain host / class plan change
        const keepName = AL.academyRetryName(String(acc.character), cr);
        const { names, mk } = makeCreate(ctx, acc, C, taken, del, keepName);
        try { fs.unlinkSync(path.join(P(ctx).logs, `academy_create_${login}.json`)); } catch (e) { }
        let out;
        if (keepName && names[0] === String(acc.character) && xmlHasScript(ctx, acc.config, mk)) out = 'same name, the account stays open - the create script was rewritten (L2Swarm reloads it)';
        else out = await reopenAs(ctx, acc, names[0], mk);
        // RECREATE2-2026-11-03 (live 15:48Z: "Ashra00 leads now (was Shadra2793)" - clearing setupFor on a same-name retry made the leader 'not ready'
        // for one tick and the group sync handed the group to the next account): the setup stays when the name stays
        if (names[0] !== String(acc.character)) D.setupFor = '';
        D.retries = (Number(D.retries) || 0) + 1; D.createAt = iso(); delete D.forceRetry;   // RECREATE-2026-11-03
        log(ctx, `${login}: ${dec.why} — new try as ${names[0]} (${del.length ? 'deleting ' + del.join(', ') : 'nothing new to delete'}; open_account: ${out.replace(/\s+/g, ' ').slice(0, 120)})`); acted.push(login);
      } else if (dec.act === 'reopen') {   // RECREATE-2026-11-03: created, but it never came into the game - open the account again (same name)
        const out = await reopenAs(ctx, acc, String(acc.character), null);
        D.retries = (Number(D.retries) || 0) + 1; D.createAt = iso(); delete D.forceRetry;
        log(ctx, `${login}: ${dec.why} (open_account: ${out.replace(/\s+/g, ' ').slice(0, 120)})`); acted.push(login);
      } else if (dec.act === 'logout') {
        try { await mcp(ctx, 'close_account', { config_path: path.join(P(ctx).settings, acc.config || '') }, 30000); } catch (e) { }
        D.loggedOutFor = String(acc.character); log(ctx, `${login}: ${dec.why}`); acted.push(login);
      } else if (dec.act === 'slotsfull') {
        D.stopped = dec.why; log(ctx, `${login}: STOPPED — ${dec.why}`);
        try { await mcp(ctx, 'close_account', { config_path: path.join(P(ctx).settings, acc.config || '') }, 30000); } catch (e) { }
        acted.push(login);
      }
    }
  } catch (e) { log(ctx, 'tick error: ' + (e && e.stack || e)); }
  finally { mgrSave(ctx, M); STATE.busy = false; }
  return { acted };
}
function status(ctx) {
  const M = mgrRead(ctx), C = cfgOf(ctx);
  return { ok: true, cfg: { on: C.on, coupons: C.coupons, classPlan: C.classPlan, funds: C.funds, end: C.end, buffs: C.buffs }, accounts: academyAccounts(ctx).map(a => {
    const login = String(a.login).toLowerCase(), D = M.accounts[login] || {}, st = readJ(path.join(P(ctx).logs, `academy_${a.character}.json`), null);
    return { login, character: a.character, status: st ? st.status : 'not started', text: st ? st.text : '', level: st ? st.level : null, decision: D.decision || '', why: D.why || '', made: D.made || 1, stopped: D.stopped || '', history: D.history || [] };
  }) };
}
async function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/academy') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { ctx.json(res, 200, status(ctx)); return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  const login = String(b.login || '').toLowerCase(), M = mgrRead(ctx);
  if (!M.accounts[login] && !academyAccounts(ctx).some(a => String(a.login).toLowerCase() === login)) { ctx.json(res, 404, { error: 'not an academy account' }); return true; }
  M.accounts[login] = M.accounts[login] || { made: 1 };
  if (b.action === 'stop') { M.accounts[login].stopped = 'stopped on the dashboard'; log(ctx, `${login}: stopped on the dashboard`); }
  else if (b.action === 'resume') { delete M.accounts[login].stopped; log(ctx, `${login}: resumed on the dashboard`); }
  else if (b.action === 'recreate') { M.accounts[login].forceRetry = iso(); delete M.accounts[login].stopped; log(ctx, `${login}: re-create asked on the dashboard (next tick)`); }   // RECREATE-2026-11-03; RECREATE2: forceRetry = a time, never a stale flag
  else { ctx.json(res, 400, { error: 'action: stop | resume | recreate' }); return true; }
  mgrSave(ctx, M); ctx.json(res, 200, status(ctx)); return true;
}
module.exports = { tick, status, handle, doSetup, acadSetupRole, makeCreate, reopenAs, rosterRename, bhAllowRename, xmlPoint, groupSync, leaderTakeOver, STATE };
