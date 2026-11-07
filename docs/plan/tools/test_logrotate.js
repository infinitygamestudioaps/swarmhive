// LOGROTATE-2026-11-04: guard test for Dashboard/logrotate.js (sandbox files only, never the live Logs)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const R = path.join(__dirname, '../../..'), LR = require(path.join(R, 'Dashboard', 'logrotate.js'));
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 300))); } };
const MB = 1048576, now = Date.parse('2026-11-04T08:00:00Z'), cfg = Object.assign({}, LR.DEF);

// 1) decide: only big non-keep *.log are cut; state files never; old html (not KEEP_HTML) deleted; old archives deleted
const files = [
  { name: 'intent_Tank1.log', size: 90 * MB, mtimeMs: now, dir: '' }, { name: 'swarm_buffs.log', size: 21 * MB, mtimeMs: now, dir: '' },
  { name: 'small.log', size: 3 * MB, mtimeMs: now, dir: '' }, { name: 'LOG.log', size: 500 * MB, mtimeMs: now, dir: '' },
  { name: 'raid_seen.log', size: 99 * MB, mtimeMs: now, dir: '' }, { name: 'crafter_ledger_in.log', size: 99 * MB, mtimeMs: now, dir: '' },
  { name: 'swarm_state_Tank1.json', size: 99 * MB, mtimeMs: 0, dir: '' }, { name: 'plan_progress_Tank1.json', size: 99 * MB, mtimeMs: 0, dir: '' },
  { name: 'runner_queue.json', size: 1, mtimeMs: 0, dir: '' }, { name: 'npc_Tank1.html', size: 10, mtimeMs: now - 5 * 86400000, dir: '' },
  { name: 'npc_Bishop1.html', size: 10, mtimeMs: now - 3600000, dir: '' }, { name: 'clan_page_levelup_x_2.html', size: 10, mtimeMs: now - 30 * 86400000, dir: '' },
  { name: 'old.2026-10-01.log.gz', size: 10, mtimeMs: now - 20 * 86400000, dir: 'archive' }, { name: 'new.2026-11-03.log.gz', size: 10, mtimeMs: now - 86400000, dir: 'archive' },
  { name: 'big.log', size: 99 * MB, mtimeMs: now, dir: 'walkpaths' } ];
const d = LR.decide(files, cfg, now);
t('big tail logs are cut (intent, swarm_buffs), small ones not', d.cut.includes('intent_Tank1.log') && d.cut.includes('swarm_buffs.log') && !d.cut.includes('small.log'), d);
t('KEEP logs are never cut (LOG.log, raid history, the bank ledger)', !d.cut.some(n => /^(LOG|raid_seen|crafter_ledger_in)\.log$/.test(n)), d.cut);
t('state files are never touched (json state, queues)', ![].concat(d.cut, d.delHtml, d.delArchive).some(n => /\.json$/.test(n)), d);
t('nothing inside other folders (walkpaths ...) is touched', !d.cut.includes('big.log'), d.cut);
t('old page dumps deleted, new ones and KEEP_HTML (clan_page_) kept', d.delHtml.includes('npc_Tank1.html') && !d.delHtml.includes('npc_Bishop1.html') && !d.delHtml.some(n => /^clan_page_/.test(n)), d.delHtml);
t('archives older than archiveDays deleted, newer kept', d.delArchive.includes('old.2026-10-01.log.gz') && !d.delArchive.includes('new.2026-11-03.log.gz'), d.delArchive);
t('settings default: on, 20 MB -> keep 5 MB, 14 days archives, 3 days html', cfg.on === true && cfg.maxMb === 20 && cfg.keepMb === 5 && cfg.archiveDays === 14 && cfg.htmlDays === 3);

// 2) cutOne on a sandbox file: keeps the newest lines, whole lines, gzip of the older part in archive/
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logrot_')), f = path.join(dir, 'intent_X.log');
  const lines = []; for (let i = 0; i < 20000; i++) lines.push(`2026-11-04T07:00:${String(i % 60).padStart(2, '0')}Z line ${i} ` + 'x'.repeat(40));
  fs.writeFileSync(f, lines.join('\n') + '\n');
  const size = fs.statSync(f).size, keep = 100000;
  const freed = await LR.cutOne(dir, 'intent_X.log', keep, now);
  const rest = fs.readFileSync(f, 'utf8');
  t('cut keeps at most keepBytes, from a whole line, the newest line last', rest.length <= keep && /^2026-11-04T/.test(rest) && rest.trimEnd().endsWith('line 19999 ' + 'x'.repeat(40)), rest.slice(0, 80));
  const gz = path.join(dir, 'archive', 'intent_X.2026-11-04.log.gz'), old = zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8');
  t('the older part is in archive/<name>.<date>.log.gz and nothing is lost', fs.existsSync(gz) && old.length + rest.length === size && freed === old.length, { old: old.length, rest: rest.length, size, freed });
  t('no temp file left behind', !fs.existsSync(f + '.rot_tmp'));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { }

  // 3) every Logs/*.log the code reads back is classified (KEEP = never cut, TAIL = cut keeps what they read) - a new reader must be added
  const srcs = fs.readdirSync(path.join(R, 'Dashboard')).filter(f => /\.js$/.test(f)).map(f => fs.readFileSync(path.join(R, 'Dashboard', f), 'utf8'));
  srcs.push(fs.readFileSync(path.join(R, 'docs', 'plan', 'tools', 'raid_log.js'), 'utf8'));
  const names = new Set(); srcs.forEach(s => { (s.match(/['`"\/\\][A-Za-z0-9_]+(\$\{[^}]{1,30}\}[A-Za-z0-9_]*)*\.log['`"]/g) || []).forEach(m => names.add(m.replace(/['`"\/\\]/g, '').replace(/\$\{[^}]*\}/g, 'X'))); });
  const un = [...names].filter(n => !LR.keepLog(n) && !LR.tailLog(n));
  t(`every *.log the dashboard / raid_log reads is in KEEP_LOG or TAIL_LOG (${names.size} names)`, un.length === 0, un);
  const SRV = fs.readFileSync(path.join(R, 'Dashboard', 'server.js'), 'utf8');
  t('server.js starts it and serves /api/logrotate', SRV.includes("require('./logrotate').start({ DATA, LOGS })") && SRV.includes("require('./logrotate').handle(req, res, url,"));
  t('the PC tab shows the Logs size + last rotation', fs.readFileSync(path.join(R, 'Dashboard', 'index.html'), 'utf8').includes("api('/api/logrotate')"));
  t('the settings file exists and is on', JSON.parse(fs.readFileSync(path.join(R, 'Scripts', 'data', 'log_rotate.json'), 'utf8')).on === true);
  // the API answers 200 (server.js json(res, code, obj)) - live 2026-11-04 it passed the object as the status code
  t('the API answers with status 200', require('fs').readFileSync(require('path').join(__dirname, '../../../Dashboard/logrotate.js'), 'utf8').includes('ctx.json(res, 200, { ok: true'));
  console.log(`logrotate: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
