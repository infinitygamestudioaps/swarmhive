// RAID LOG (user 2026-10-06: "record and document everything"): builds docs/plan/raid_log.md from what the bots wrote:
//   Logs/raid_seen.log        every raid attempt (time, boss id, name, outcome)
//   Logs/raid_reports/*.json  every fight (duration, events: deaths, aggro, Ultimate Defense, minions, levels before/after)
//   Logs/raid_loot.log        every drop picked up after a kill
//   Logs/raid_status.json     last known state per boss (kill time -> respawn window)
//   Scripts/data/routes/raid/ the saved landing -> boss walks (shared by every party)
// Run: node docs/plan/tools/raid_log.js   (Dashboard/server.js also rebuilds it every 5 minutes)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..'), LOGS = path.join(ROOT, 'Logs'), DATA = path.join(ROOT, 'Scripts', 'data');
const OUT = path.join(ROOT, 'docs', 'plan', 'raid_log.md');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean); } catch (e) { return []; } };
const T = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const km = (u) => u >= 1000 ? (u / 1000).toFixed(1) + ' km' : Math.round(u) + ' u';
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

function build() {
  const bosses = readJson(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] }).bosses || [];
  const byId = {}, byName = {}; bosses.forEach(b => { byId[String(b.id)] = b; byName[b.name] = b; });
  const seen = lines(path.join(LOGS, 'raid_seen.log')).map(l => { const [at, id, name, outcome] = l.split('\t'); return { at, id, name, outcome: (outcome || '').trim() }; }).filter(x => x.name);
  const status = readJson(path.join(LOGS, 'raid_status.json'), {}) || {};
  let reports = []; try { reports = fs.readdirSync(path.join(LOGS, 'raid_reports')).filter(f => f.endsWith('.json')).map(f => readJson(path.join(LOGS, 'raid_reports', f), null)).filter(Boolean); } catch (e) { }
  reports.sort((a, b) => String(b.start).localeCompare(String(a.start)));
  const loot = lines(path.join(LOGS, 'raid_loot.log')).map(l => { const [at, boss, who, id, item, count] = l.split('\t'); return { at, boss, who, item, count: +count || 0 }; });
  const routesDir = path.join(DATA, 'routes', 'raid');
  let routes = []; try { routes = fs.readdirSync(routesDir).filter(f => /^\d+\.json$/.test(f)).map(f => readJson(path.join(routesDir, f), null)).filter(Boolean); } catch (e) { }
  routes.sort((a, b) => ((byId[String(a.id)] || {}).level || 0) - ((byId[String(b.id)] || {}).level || 0));

  const kills = seen.filter(s => /dead$/.test(s.outcome));
  const out = [];
  out.push('# Raid log', '', `_Generated ${T(new Date().toISOString())} from the bots' own logs by \`docs/plan/tools/raid_log.js\` (rebuilt every 5 min by the dashboard server). Do not edit by hand._`, '');
  out.push(`**Kills: ${kills.length}** · attempts: ${seen.length} · saved routes: ${routes.length} (${routes.filter(r => r.manual).length} locked)`, '');

  // respawn timers
  out.push('## Respawn timers (killed or found dead)', '', 'Window = time of death + the datapack respawn (L2Toggle\'s real times are not published). "found dead" = not at its spawn when we came, so it died earlier (the window is an upper bound).', '');
  out.push('| Boss | Lvl | Last death | How we know | Respawn window | Up from |', '|---|---|---|---|---|---|');
  const dead = Object.keys(status).map(id => ({ id, ...status[id] })).filter(s => s.alive === false).map(s => ({ ...s, b: byId[s.id] || byName[s.name] || {} }))
    .sort((a, b) => Date.parse(a.at) + (a.b.respawnMinH || 12) * 3600e3 - (Date.parse(b.at) + (b.b.respawnMinH || 12) * 3600e3));
  dead.forEach(s => { const lo = Date.parse(s.at) + (s.b.respawnMinH || 12) * 3600e3, hi = Date.parse(s.at) + (s.b.respawnMaxH || s.b.respawnMinH || 12) * 3600e3;
    const ours = seen.some(x => x.name === s.name && /dead$/.test(x.outcome) && Math.abs(Date.parse(x.at) - Date.parse(s.at)) < 30 * 60e3);
    out.push(`| ${esc(s.name)} | ${s.b.level || ''} | ${T(s.at)} | ${ours ? 'killed by us' : 'found dead'} | ${s.b.respawnMinH || '?'}–${s.b.respawnMaxH || '?'} h | ${Date.now() > lo ? '**may be up now**' : T(new Date(lo).toISOString())} (latest ${T(new Date(hi).toISOString())}) |`); });
  if (!dead.length) out.push('| (none) | | | | | |');
  out.push('');

  // kills with fight details
  out.push('## Kills', '', '| When | Boss | Lvl | Fight | Our deaths | Ultimate Defense | Route | Drops |', '|---|---|---|---|---|---|---|---|');
  kills.slice().reverse().forEach(k => {
    const t = Date.parse(k.at), b = byId[k.id] || byName[k.name] || {};
    const rep = reports.find(r => r.boss === k.name && Math.abs(Date.parse(r.end || r.start) - t) < 15 * 60e3);
    const ev = rep ? rep.events || [] : [];
    const deaths = ev.filter(e => /DIED|died/.test(e.msg || '')).map(e => (e.msg.match(/^([A-Za-z]+)/) || [])[1]).filter(Boolean);
    const ud = ev.filter(e => /Ultimate Defense/.test(e.msg || '')).length;
    const sum = {}; loot.filter(l => l.boss === k.name && Math.abs(Date.parse(l.at) - t) < 10 * 60e3).forEach(l => { sum[l.item] = (sum[l.item] || 0) + l.count; });
    const drops = Object.keys(sum).map(i => `${i} ×${sum[i].toLocaleString('da-DK')}`);
    const rt = routes.find(r => String(r.id) === String(k.id));
    out.push(`| ${T(k.at)} | ${esc(k.name)} | ${b.level || ''} | ${rep ? Math.round(rep.durationS / 60) + ' min' : '?'} | ${deaths.length ? deaths.join(', ') : 'none'} | ${ud || ''} | ${rt ? esc(rt.landing) : ''} | ${esc(drops.join(', ') || '—')} |`);
  });
  if (!kills.length) out.push('| (none yet) | | | | | | | |');
  out.push('');

  // every attempt
  out.push('## All attempts (newest first)', '', 'dead = killed · not-found = not at its spawn (killed by others) · wiped = we all died · timeout/lost = gave up', '', '| When | Boss | Lvl | Outcome |', '|---|---|---|---|');
  seen.slice().reverse().slice(0, 150).forEach(s => out.push(`| ${T(s.at)} | ${esc(s.name)} | ${(byId[s.id] || {}).level || ''} | ${esc(s.outcome)} |`));
  out.push('');

  // routes with waypoints
  out.push('## Saved routes (shared by every party)', '', 'Each file `Scripts/data/routes/raid/<bossId>.json` = the walk from the landing to the boss. Correct / lock them on the dashboard: Raids → tap the boss → "Route to this boss". **locked** = used exactly like this, never replaced by a new recording.', '');
  routes.forEach(r => {
    const b = byId[String(r.id)] || {};
    out.push(`### ${esc(r.boss)} (lvl ${b.level || '?'}, id ${r.id}) — ${r.manual ? '**locked**' : 'recorded'}`, '',
      `- Landing: **${esc(r.landing)}** · ${r.points.length} points · ${km(r.length || 0)} walk`,
      `- Used ${r.uses || 0}× · failed ${r.fails || 0}× · last OK ${T(r.lastOk) || '—'} · ${r.editedAt ? 'edited ' + T(r.editedAt) : 'recorded ' + T(r.savedAt)}`,
      `- Boss spawn: ${b.x}, ${b.y}, ${b.z}`, '',
      '<details><summary>Waypoints (x, y, z)</summary>', '', '```', ...r.points.map((p, i) => `${String(i + 1).padStart(3)}  ${p.x}, ${p.y}, ${p.z}`), '```', '</details>', '');
  });
  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  return { kills: kills.length, attempts: seen.length, routes: routes.length };
}
module.exports = { build };
if (require.main === module) console.log(build());
