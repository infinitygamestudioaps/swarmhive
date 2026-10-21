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
async function mcp(ctx, tool, args, ms) {
  if (typeof ctx.mcpCall !== 'function') throw new Error('no L2Swarm connection (mcpCall)');
  let t; try { return String(await Promise.race([Promise.resolve(ctx.mcpCall(tool, args)), new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms || 30000); })]) || ''); } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------------------------------------------------------------------- actions
async function doSetup(ctx, acc, C) {
  const name = String(acc.character), by = 'academy pipeline (owner 2026-10-21)', out = [];
  if (typeof ctx.reloadCfg === 'function') try { ctx.reloadCfg(); } catch (e) { }
  try {   // 1) the approved class plan (the owner's pipeline order = the approval)
    const r = await require('./classpage_api').post(ctx, { action: 'set', leader: name, name, plan: C.classPlan, approve: true, confirm: true, by, note: 'academy mage (Dark Elven Mystic -> Dark Wizard -> Spellhowler)' });
    out.push('class plan ' + (r && r.ok ? 'approved' : 'FAILED: ' + (r && r.error)));
  } catch (e) { out.push('class plan FAILED: ' + e.message); }
  try {   // 2) the party plan (on = used on Start)
    const r = await require('./partyplan_api').post(ctx, { action: 'set', party: name, plan: AL.academyPlan(C, name), by });
    out.push('party plan ' + (r && r.ok ? 'set' : 'FAILED: ' + (r && r.error)));
  } catch (e) { out.push('party plan FAILED: ' + e.message); }
  try {   // 3) the clan leader may invite it (into the Academy: swarm.config.json academy: true)
    const CQF = path.join(P(ctx).data, 'clan_quests.json'), cq = readJ(CQF, {}); cq.clan = cq.clan || {};
    const a = new Set((cq.clan.inviteAllow || []).map(String)); if (!a.has(name)) { a.add(name); cq.clan.inviteAllow = [...a].sort(); try { fs.copyFileSync(CQF, path.join(P(ctx).settings, 'backup', 'clan_quests_' + Date.now() + '.json')); } catch (e) { } writeAtomic(CQF, JSON.stringify(cq, null, 2)); }
    out.push('invite list OK');
  } catch (e) { out.push('invite list FAILED: ' + e.message); }
  try {   // 4) run switch ON (+ !start when it is online; else it starts the plan at its login)
    const r = await require('./runstate_api').post(ctx, { party: name, on: true, by, send: true });
    out.push('run switch ' + (r && r.ok ? 'ON' : 'FAILED: ' + (r && r.error)));
  } catch (e) { out.push('run switch FAILED: ' + e.message); }
  return out;
}
/** a fresh name list + the create script for the next character of this account */
function makeCreate(ctx, acc, C, taken) {
  const AA = require('./addaccount_api');
  const names = AL.academyNames(C, ctx.rnd || Math.random, taken, Number(C.names.tries) || 6);
  const classes = AA.baseClasses(ctx), cls = classes.find(c => c.id === Number(C.classId)) || { race: C.race, id: C.classId, type: 'mystic' };
  const sexes = (C.sexes || [0, 1]).filter(s => !cls.gender || (cls.gender === 'M' ? s === 0 : s === 1));
  const sex = sexes.length ? sexes[Math.floor((ctx.rnd || Math.random)() * sexes.length) % sexes.length] : 0;
  const mk = 'mkchar_' + String(acc.login).toLowerCase() + '.js';
  const rootFwd = String(ctx.ROOT).replace(/\\/g, '/');
  const stats = AA.BASE_STATS[cls.id] || AA.BASE_STATS[10];
  fs.writeFileSync(path.join(ctx.ROOT, 'Scripts', mk), AA.buildCreateScript(rootFwd, String(acc.login).toLowerCase(), { race: cls.race, sex, classId: cls.id, stats, names, resultFile: 'Logs/academy_create_' + String(acc.login).toLowerCase() + '.json' }, names[0]));
  return { names, mk };
}
async function reopenAs(ctx, acc, newName, mkFile) {
  const cfgPath = path.join(P(ctx).settings, acc.config || '');
  try { await mcp(ctx, 'close_account', { config_path: cfgPath }, 30000); } catch (e) { log(ctx, `${acc.login}: close_account: ${e.message} (going on)`); }
  await new Promise(r => setTimeout(r, ctx.closeWaitMs != null ? ctx.closeWaitMs : 5000));
  xmlPoint(ctx, acc.config, newName, mkFile);
  rosterRename(ctx, acc.login, acc.character, newName);
  let out = ''; try { out = await mcp(ctx, 'open_account', { config_path: cfgPath }, 30000); } catch (e) { out = 'error: ' + e.message; }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------- tick
async function tick(ctx) {
  if (STATE.busy) return { skipped: 'busy' };
  STATE.busy = true;
  const M = mgrRead(ctx), C = cfgOf(ctx), acted = [];
  try {
    const accs = academyAccounts(ctx);
    const taken = new Set(); (() => { try { JSON.parse(rosterRaw(ctx).replace(/^﻿/, '')).accounts.forEach(a => a && a.character && taken.add(String(a.character).toLowerCase())); } catch (e) { } })();
    for (const acc of accs) {
      const login = String(acc.login).toLowerCase(), D = M.accounts[login] = M.accounts[login] || { made: 1 };
      const st = readJ(path.join(P(ctx).logs, `academy_${acc.character}.json`), null), cr = readJ(path.join(P(ctx).logs, `academy_create_${login}.json`), null);
      const dec = AL.academyDecide(acc, st, cr, D, C);
      D.decision = dec.act; D.why = dec.why; D.character = acc.character;
      if (dec.act === 'wait' || dec.act === 'none') continue;
      if (acted.length) continue;                                         // one account action per tick
      if (dec.act === 'setup') {
        const r = await doSetup(ctx, acc, C); D.setupFor = String(acc.character); D.setupAt = iso(); D.setupResult = r.join('; ');
        log(ctx, `${login}/${acc.character}: setup — ${D.setupResult}`); acted.push(login);
      } else if (dec.act === 'rename') {
        log(ctx, `${login}: ${dec.why} — swarm.config.json + Settings\\${acc.config} follow`);
        const out = await reopenAs(ctx, acc, dec.name, null);
        D.renamed = (D.renamed || []).concat([{ from: acc.character, to: dec.name, at: iso() }]).slice(-10); D.setupFor = '';
        log(ctx, `${login}: now ${dec.name} (open_account: ${out.replace(/\s+/g, ' ').slice(0, 120)})`); acted.push(login);
      } else if (dec.act === 'next') {
        const { names, mk } = makeCreate(ctx, acc, C, taken);
        try { fs.unlinkSync(path.join(P(ctx).logs, `academy_create_${login}.json`)); } catch (e) { }
        const old = String(acc.character);
        const out = await reopenAs(ctx, acc, names[0], mk);
        D.made = (Number(D.made) || 1) + 1; D.history = (D.history || []).concat([{ graduated: old, at: iso() }]).slice(-20); D.setupFor = '';
        log(ctx, `${login}: ${old} graduated — next academy character ${names[0]} (try names ${names.join(', ')}; character ${D.made} on this account; open_account: ${out.replace(/\s+/g, ' ').slice(0, 120)})`); acted.push(login);
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
  return { ok: true, cfg: { on: C.on, classPlan: C.classPlan, funds: C.funds, end: C.end }, accounts: academyAccounts(ctx).map(a => {
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
  else { ctx.json(res, 400, { error: 'action: stop | resume' }); return true; }
  mgrSave(ctx, M); ctx.json(res, 200, status(ctx)); return true;
}
module.exports = { tick, status, handle, doSetup, makeCreate, reopenAs, rosterRename, xmlPoint, STATE };
