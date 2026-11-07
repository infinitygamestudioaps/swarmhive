'use strict';
// LOGROTATE-2026-11-04 (owner: YES to an automatic log rotation - our Logs folder was 3.7 GB / 4983 files; tester Vykaax 4.7 GB asked if
// deleting Logs is safe). Runs from Dashboard/server.js at start and every 6 h (public package too).
//   * STATE files are never touched: only top-level Logs/*.log text files (cut) and old dialog page dumps (*.html, deleted) are handled -
//     every other file (json state, folders walkpaths / geopath / brain_cache / orders / handover / itemjobs / raid_reports / cmd ...) is left alone.
//   * a *.log above maxMb is cut to its newest keepMb (whole lines, temp file + rename = atomic); the cut-off older part is gzip'ed to
//     Logs/archive/<name>.<YYYY-MM-DD>.log.gz; a file another process holds (rename refused) is skipped and retried next round.
//   * KEEP_LOG: history logs other code reads IN FULL (raid history, ledger, loot) are never cut. TAIL_LOG: logs read back only for their
//     newest lines (cut is safe). docs/plan/tools/test_logrotate.js fails when code reads a Logs/*.log that is in neither list.
//   * archives older than archiveDays and dialog page dumps older than htmlDays are deleted (KEEP_HTML pages are kept: a tool reads them).
//   * never anything outside Logs/. Settings: Scripts/data/log_rotate.json { on, maxMb, keepMb, archiveDays, htmlDays }.
//   GET /api/logrotate (key checked inside): { last: { at, freedMb, totalMb, cut, deleted, skipped } }
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const DEF = { on: true, maxMb: 20, keepMb: 5, archiveDays: 14, htmlDays: 3 };
// read IN FULL by code (raid_log.js history, the bank ledger, loot pages, L2Swarm's own LOG.log which L2Swarm rotates itself) - never cut
const KEEP_LOG = [/^LOG\.log$/i, /^raid_(seen|loot|respawn|heals|dmg_raw)\.log$/, /^raidcircuit\.log$/, /^crafter_ledger.*\.log$/, /^loot_.*\.log$/,
  /^l2day_rewards\.log$/, /^enchant\.log$/, /^gear_upgrades\.log$/, /^pshop_buys\.log$/, /^purse\.log$/, /^transfer\.log$/, /^soul\.log$/];
// read back only for their newest lines (tails, timelines, status) - a cut keeps what they need
const TAIL_LOG = [/^intent_.+\.log$/, /^swarm_chat_.+\.log$/, /^xfer_.+\.log$/, /^viewsample_.+\.log$/, /^xmlfix_.+\.log$/,
  /^(academy|alts|autofund|brain|brain_host|clan|client_mode|combatprofile|craftmake|daily|dashboard_commands|dashboard_perf|dashboard_restart|dataservice|dawn|deploy_swarm|dispatch|engine_switch|floor_maps|handover|itemjobs|kamaloka|l2swarm_ctl|loot_kept|memwatch|mob_ignore|nav_atlas_runs|orders|polyedit|questplan_edits|supervisor|swarm_buffs|swarm_errors|whauto|whtake|whsell|trade|warnings|vitality|v8gc|toi_scout|town_landings_new|agent_perf|announcements|assist_diag|spoil|positional|tactics|raid_heals_dbg|dialog|letters|teamwatch_.+)\.log$/];
const KEEP_HTML = [/^clan_page_/];   // docs/plan/tools/clan_ranks.js reads the newest clan_page_levelup_*.html

const keepLog = (n) => KEEP_LOG.some(r => r.test(n));
const tailLog = (n) => TAIL_LOG.some(r => r.test(n));
function cfgOf(DATA) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(path.join(DATA, 'log_rotate.json'), 'utf8').replace(/^﻿/, '')) || {}; } catch (e) { }
  const o = Object.assign({}, DEF, j); ['maxMb', 'keepMb', 'archiveDays', 'htmlDays'].forEach(k => { o[k] = Math.max(k === 'htmlDays' || k === 'archiveDays' ? 1 : 1, Number(o[k]) || DEF[k]); });
  if (o.keepMb >= o.maxMb) o.keepMb = Math.max(1, Math.floor(o.maxMb / 4));
  return o;
}
/** pure: files = [{ name, size, mtimeMs, dir: '' | 'archive' }] -> { cut: [names], delHtml: [names], delArchive: [names] } */
function decide(files, cfg, nowMs) {
  const MB = 1048576, out = { cut: [], delHtml: [], delArchive: [] };
  (files || []).forEach(f => {
    if (!f || !f.name) return;
    if (f.dir === 'archive') { if (/\.log\.gz$/.test(f.name) && nowMs - f.mtimeMs > cfg.archiveDays * 86400000) out.delArchive.push(f.name); return; }
    if (f.dir) return;                                                                     // never inside other folders
    if (/\.log$/i.test(f.name)) { if (!keepLog(f.name) && f.size > cfg.maxMb * MB) out.cut.push(f.name); return; }
    if (/\.html?$/i.test(f.name)) { if (!KEEP_HTML.some(r => r.test(f.name)) && nowMs - f.mtimeMs > cfg.htmlDays * 86400000) out.delHtml.push(f.name); }
  });
  return out;
}
function dirSize(p) { let n = 0; try { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, e.name); try { n += e.isDirectory() ? dirSize(q) : fs.statSync(q).size; } catch (x) { } } } catch (e) { } return n; }
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
/** cut one log: gzip the older part to archive/, keep the newest keepBytes (from a line start), temp + rename. -> freed bytes | -1 skipped */
async function cutOne(LOGS, name, keepBytes, nowMs) {
  const f = path.join(LOGS, name), st = fs.statSync(f), size = st.size; if (size <= keepBytes) return 0;
  const start = size - keepBytes, fd = fs.openSync(f, 'r');
  let tail; try { tail = Buffer.alloc(keepBytes); fs.readSync(fd, tail, 0, keepBytes, start); } finally { fs.closeSync(fd); }
  const nl = tail.indexOf(10); if (nl >= 0 && nl < tail.length - 1) tail = tail.subarray(nl + 1);   // whole lines only
  const headEnd = size - tail.length, arch = path.join(LOGS, 'archive'); try { fs.mkdirSync(arch, { recursive: true }); } catch (e) { }
  const gz = path.join(arch, `${name.replace(/\.log$/i, '')}.${day(nowMs)}.log.gz`);
  await new Promise((res, rej) => { const r = fs.createReadStream(f, { start: 0, end: Math.max(0, headEnd - 1) }), z = zlib.createGzip(), w = fs.createWriteStream(gz, { flags: 'a' });
    r.on('error', rej); w.on('error', rej); w.on('finish', res); r.pipe(z).pipe(w); });
  const tmp = f + '.rot_tmp'; fs.writeFileSync(tmp, tail);
  try { fs.renameSync(tmp, f); } catch (e) { try { fs.unlinkSync(tmp); } catch (x) { } return -1; }   // held open by a process: next round
  return headEnd;
}
const RUN = { busy: false, last: null };
async function run(ctx, nowMs) {
  if (RUN.busy) return RUN.last; RUN.busy = true;
  const now = nowMs || Date.now(), LOGS = ctx.LOGS, cfg = cfgOf(ctx.DATA), res = { at: new Date(now).toISOString(), freedMb: 0, cut: [], deleted: 0, skipped: [], totalMb: 0, on: cfg.on };
  try {
    if (!cfg.on) return res;
    const files = []; const push = (dir, base) => { try { fs.readdirSync(base, { withFileTypes: true }).forEach(e => { if (e.isFile()) { try { const s = fs.statSync(path.join(base, e.name)); files.push({ name: e.name, size: s.size, mtimeMs: s.mtimeMs, dir }); } catch (x) { } } }); } catch (e) { } };
    push('', LOGS); push('archive', path.join(LOGS, 'archive'));
    const d = decide(files, cfg, now); let freed = 0;
    for (const n of d.cut) { try { const b = await cutOne(LOGS, n, Math.floor(cfg.keepMb * 1048576), now); if (b < 0) res.skipped.push(n); else { freed += b; res.cut.push(n); } } catch (e) { res.skipped.push(n); } }
    d.delHtml.forEach(n => { try { const s = fs.statSync(path.join(LOGS, n)).size; fs.unlinkSync(path.join(LOGS, n)); freed += s; res.deleted++; } catch (e) { } });
    d.delArchive.forEach(n => { try { const p = path.join(LOGS, 'archive', n), s = fs.statSync(p).size; fs.unlinkSync(p); freed += s; res.deleted++; } catch (e) { } });
    res.freedMb = Math.round(freed / 1048576); res.totalMb = Math.round(dirSize(LOGS) / 1048576);
    try { fs.writeFileSync(path.join(LOGS, 'log_rotate_state.json'), JSON.stringify(res, null, 1)); } catch (e) { }
  } finally { RUN.busy = false; RUN.last = res; }
  return res;
}
function start(ctx) {
  setTimeout(() => { run(ctx).catch(() => { }); }, 60000);                  // a minute after the dashboard start
  setInterval(() => { run(ctx).catch(() => { }); }, 6 * 3600000);
}
async function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/logrotate') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  let last = RUN.last; if (!last) { try { last = JSON.parse(fs.readFileSync(path.join(ctx.LOGS, 'log_rotate_state.json'), 'utf8')); } catch (e) { last = null; } }
  ctx.json(res, 200, { ok: true, cfg: cfgOf(ctx.DATA), last }); return true;   // server.js json(res, code, obj)
}
module.exports = { decide, cutOne, run, start, handle, cfgOf, keepLog, tailLog, KEEP_LOG, TAIL_LOG, KEEP_HTML, DEF };
