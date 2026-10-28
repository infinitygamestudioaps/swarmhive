// Snapshot the volatile Logs/npc_<Char>.html (last NPC page each character received) into stable live-proof files
// Logs/npclive_<Npc>_<hash8>.html (raw, unchanged content; npc_dialogs_build.js reads every Logs/*.html). Dry run unless --apply.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const LOGS = 'C:/RainbowControl/l2/L2Swarm/Logs', apply = process.argv.includes('--apply');
const dlg = fs.readFileSync(path.join(LOGS, 'dialog.log'), 'utf8').split(/\r?\n/).slice(-60000);
const re = /^(\S+) (\S+): (?:opened (.+?) \(|clicked '[\s\S]*?' at (.+?) -> )/;
const lastNpc = {}; // char -> [{t, npc}]
for (const l of dlg) { const m = re.exec(l); if (!m) continue; const npc = m[3] || m[4]; if (/Community Board/.test(npc)) continue; (lastNpc[m[2]] = lastNpc[m[2]] || []).push({ t: Date.parse(m[1]), npc }); }
const have = new Set(fs.readdirSync(LOGS).filter(f => /^npclive_/.test(f)).map(f => f.replace(/^.*_([0-9a-f]{8})\.html$/, '$1')));
const out = [];
for (const f of fs.readdirSync(LOGS)) {
  const m = /^npc_([A-Za-z0-9]+)\.html$/.exec(f); if (!m) continue;
  const abs = path.join(LOGS, f), st = fs.statSync(abs); const html = fs.readFileSync(abs);
  if (!/<html/i.test(html.toString('utf8'))) continue;
  if (/_bbs|<title>/i.test(html.toString('utf8'))) continue;          // community board
  const arr = (lastNpc[m[1]] || []).filter(x => x.t <= st.mtimeMs + 2000); const npc = arr.length ? arr[arr.length - 1].npc : '';
  if (!npc || st.mtimeMs - arr[arr.length - 1].t > 120000) { out.push({ f, skip: 'no dialog.log line within 2 min' }); continue; }
  const h = crypto.createHash('sha1').update(html).digest('hex').slice(0, 8);
  if (have.has(h)) { out.push({ f, npc, skip: 'already stored' }); continue; }
  have.add(h);
  const dst = `npclive_${npc.replace(/[^A-Za-z0-9]+/g, '_')}_${h}.html`;
  out.push({ f, npc, dst, at: st.mtime.toISOString() });
  if (apply) { fs.copyFileSync(abs, path.join(LOGS, dst)); fs.utimesSync(path.join(LOGS, dst), st.atime, st.mtime); }
}
console.log(JSON.stringify(out, null, 1));
