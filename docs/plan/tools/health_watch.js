// Live health watch for the swarm (main session monitor, 2026-10-09).
// Every 60 s: prints ONE line per notable problem, each problem at most once per 15 min:
//   regroup/trip step stuck > 5 min, idle in town > 10 min while leveling, deaths, new script errors,
//   state files stale (L2Swarm down), L2Swarm memory high (memwatch.log).
const fs = require('fs'), path = require('path');
const LOGS = path.join(__dirname, '..', '..', '..', 'Logs');
const seen = {};
const say = (key, text) => { const t = Date.now(); if (seen[key] && t - seen[key] < 15 * 60000) return; seen[key] = t; console.log(new Date().toTimeString().slice(0, 5) + ' ' + text); };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
let errPos = 0, buffPos = 0;
try { errPos = fs.statSync(path.join(LOGS, 'swarm_errors.log')).size; } catch (e) { }
try { buffPos = fs.statSync(path.join(LOGS, 'swarm_buffs.log')).size; } catch (e) { }
const readNew = (file, pos) => {
  try { const st = fs.statSync(file); if (st.size < pos) pos = 0; if (st.size === pos) return [pos, []];
    const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(Math.min(st.size - pos, 4e6)); fs.readSync(fd, buf, 0, buf.length, pos); fs.closeSync(fd);
    return [pos + buf.length, buf.toString('utf8').split(/\r?\n/).filter(Boolean)];
  } catch (e) { return [pos, []]; }
};
const townIdle = {};
function tick() {
  const now = Date.now();
  let files = []; try { files = fs.readdirSync(LOGS).filter(f => /^swarm_state_.+\.json$/.test(f)); } catch (e) { }
  let fresh = 0;
  for (const f of files) {
    const s = readJson(path.join(LOGS, f)); if (!s) continue; s.Name = s.Name || s.name; if (!s.Name) continue;
    const upd = Math.max(Date.parse(s.updated || 0) || 0, fs.statSync(path.join(LOGS, f)).mtimeMs);
    if (now - upd > 180000) continue; fresh++;
    const ps = s.partyStatus;
    if (ps && ps.stepAt && now - Date.parse(ps.stepAt) > 5 * 60000) {
      const m = Math.round((now - Date.parse(ps.stepAt)) / 60000);
      say('step:' + s.Name + ':' + ps.what + ':' + ps.step, `STUCK STEP: party ${s.Name} — ${ps.what} "${ps.step}" for ${m} min (${String(ps.label || '').slice(0, 80)})`);
    }
    const inTown = !s.dead && Math.hypot((s.x || 0) - 82000, (s.y || 0) - 148500) < 7000;   // idle = standing in Giran (members 'farming (bot)' in a hunting ground are fine)
    if (inTown && (s.mode === 'idle' || s.mode === 'autolevel') && !s.combat) { townIdle[s.Name] = townIdle[s.Name] || now; }
    else delete townIdle[s.Name];
    if (townIdle[s.Name] && now - townIdle[s.Name] > 10 * 60000) say('idle:' + s.Name, `IDLE: ${s.Name} has done "${String(s.task).slice(0, 60)}" for ${Math.round((now - townIdle[s.Name]) / 60000)} min`);
  }
  if (files.length && fresh === 0) say('down', 'DOWN: no character state updated for 3 min — L2Swarm or the scripts are not running');
  let lines;
  [errPos, lines] = readNew(path.join(LOGS, 'swarm_errors.log'), errPos);
  lines.filter(l => /^\d{4}-|\[/.test(l) && !/^\s+at /.test(l)).forEach(l => { const k = 'err:' + l.replace(/^\S+\s+/, '').replace(/\d+/g, '#').slice(0, 80); say(k, 'ERROR: ' + l.slice(0, 180)); });
  [buffPos, lines] = readNew(path.join(LOGS, 'swarm_buffs.log'), buffPos);
  lines.filter(l => /\] died\b|wiped|fight not won|could not reach|gave up|no wall-free route|left behind/.test(l))
    .forEach(l => { const m = l.match(/\[([^\]]+)\]\s*(.*)/); if (!m) return; const k = 'ev:' + m[1] + ':' + m[2].replace(/\d+/g, '#').slice(0, 40); say(k, 'EVENT: ' + m[1] + ': ' + m[2].slice(0, 150)); });
  try { const mw = fs.readFileSync(path.join(LOGS, 'memwatch.log'), 'utf8').trim().split(/\r?\n/).pop();
    const mb = +(mw.match(/private=(\d+)MB/) || [])[1]; const free = +(mw.match(/pcFree=(\d+)MB/) || [])[1];
    if (mb > 11000 || /RESTART|DEADLOCK/.test(mw)) say('mem:' + Math.floor(mb / 1000), 'MEMORY: ' + mw.slice(0, 150));
    if (free && free < 250) say('free', 'MEMORY: the PC has only ' + free + ' MB free');
  } catch (e) { }
}
// memory trend every 30 min (user 2026-10-09: "run stable forever") — L2Swarm private MB and the slope since the first sample
const { execSync } = require('child_process');
let memFirst = null;
function memTrend() {
  try {
    const out = execSync('powershell -NoProfile -Command "$p=Get-Process L2Swarm -EA Stop; $o=Get-CimInstance Win32_OperatingSystem; \'{0} {1} {2}\' -f [int]($p.PrivateMemorySize64/1MB),[int]($o.FreePhysicalMemory/1024),$p.StartTime.ToString(\'o\')"', { encoding: 'utf8', timeout: 30000 }).trim();
    const [mb, free, start] = out.split(' '); const t = Date.now();
    if (!memFirst || memFirst.start !== start) memFirst = { mb: +mb, t, start };
    const h = (t - memFirst.t) / 3600000; const slope = h > 0.2 ? Math.round((+mb - memFirst.mb) / h) : null;
    console.log(new Date().toTimeString().slice(0, 5) + ` MEM: L2Swarm ${mb} MB` + (slope != null ? ` (${slope >= 0 ? '+' : ''}${slope} MB/h over ${h.toFixed(1)} h)` : '') + `, PC free ${free} MB`);
  } catch (e) { console.log(new Date().toTimeString().slice(0, 5) + ' MEM: L2Swarm not running?'); }
}
tick(); setInterval(tick, 60000); memTrend(); setInterval(memTrend, 30 * 60000);
