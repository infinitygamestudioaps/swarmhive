// HIVE PAUSE (owner 2026-10-16: "just pause the entire hive if needed, then restart it all whenever the version is pushed and ready").
// Stops every party that is ON (dashboard run switch = Stop, the bots finish / drop their automation and stand), remembers exactly which ones
// were on (plus benched members), and switches those back on later. Used around deploys and releases instead of waiting for quiet moments.
//   node docs/plan/tools/hive_pause.js status
//   node docs/plan/tools/hive_pause.js pause [--force]   refuses while a raid / Kamaloka is live (a !stop ends the fight) unless --force
//   node docs/plan/tools/hive_pause.js resume            switches the remembered parties on again, restores benched members, deletes the snapshot
// Snapshot: Logs/hive_pause.json. Log: Logs/hive_pause.log. Talks to the dashboard (port 8090, Dashboard/key.txt) /api/runstate.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..', '..');
const SNAP = path.join(ROOT, 'Logs', 'hive_pause.json'), LOG = path.join(ROOT, 'Logs', 'hive_pause.log');
const KEY = (() => { try { return fs.readFileSync(path.join(ROOT, 'Dashboard', 'key.txt'), 'utf8').trim(); } catch (e) { return ''; } })();
const say = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(m); try { fs.appendFileSync(LOG, l + '\r\n'); } catch (e) { } };

function api(method, p, body) {
  return new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const rq = http.request({ host: '127.0.0.1', port: 8090, path: p, method, timeout: 20000,
      headers: Object.assign({ 'x-key': KEY }, data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) }, (r) => {
      let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(new Error(`bad answer (${r.statusCode}): ${s.slice(0, 200)}`)); } });
    });
    rq.on('error', rej); rq.on('timeout', () => rq.destroy(new Error('timeout')));
    if (data) rq.write(data); rq.end();
  });
}
/** a live raid / Kamaloka file written within the last 90 s */
function liveFights() {
  const out = []; const dir = path.join(ROOT, 'Logs');
  try { fs.readdirSync(dir).filter(f => /^(raid_live|kamaloka_live).*\.json$/.test(f)).forEach(f => { const age = (Date.now() - fs.statSync(path.join(dir, f)).mtimeMs) / 1000; if (age < 90) out.push(`${f} (${Math.round(age)} s ago)`); }); } catch (e) { }
  return out;
}

async function main() {
  const cmd = process.argv[2] || 'status', force = process.argv.includes('--force');
  const st = await api('GET', '/api/runstate');
  const on = (st.parties || []).filter(p => p.on).map(p => p.leader);
  const benched = Object.entries(st.chars || {}).filter(([, v]) => v && v.on === false).map(([n]) => n);
  const snap = (() => { try { return JSON.parse(fs.readFileSync(SNAP, 'utf8')); } catch (e) { return null; } })();
  if (cmd === 'status') {
    say(`hive: ${on.length} parties ON (${on.join(', ') || '-'}), benched members: ${benched.join(', ') || '-'}; ${snap ? `PAUSED since ${snap.at} by ${snap.why} (${snap.parties.length} to resume)` : 'not paused'}; live fights: ${liveFights().join(', ') || 'none'}`);
    return 0;
  }
  if (cmd === 'pause') {
    if (snap) { say(`already paused since ${snap.at} (${snap.parties.join(', ')}): nothing to do`); return 0; }
    const live = liveFights();
    if (live.length && !force) { say(`NOT pausing: a fight is live (${live.join(', ')}) - a !stop would end it; wait or use --force`); return 2; }
    fs.writeFileSync(SNAP, JSON.stringify({ at: new Date().toISOString(), why: process.argv.slice(3).filter(a => a !== '--force').join(' ') || 'deploy / release', parties: on, benched }, null, 1));
    for (const p of on) { const r = await api('POST', '/api/runstate', { party: p, on: false, by: 'hive_pause' }); say(`pause: ${p} -> OFF ${r && r.error ? 'ERROR ' + r.error : 'ok'}`); }
    say(`PAUSED: ${on.length} parties (${on.join(', ') || '-'}); benched kept in the snapshot: ${benched.join(', ') || '-'}`);
    return 0;
  }
  if (cmd === 'resume') {
    if (!snap) { say('not paused (no Logs/hive_pause.json): nothing to resume'); return 0; }
    for (const p of snap.parties) { const r = await api('POST', '/api/runstate', { party: p, on: true, by: 'hive_pause' }); say(`resume: ${p} -> ON ${r && r.error ? 'ERROR ' + r.error : 'ok'}`); }
    for (const n of snap.benched || []) { const r = await api('POST', '/api/runstate', { char: n, on: false, by: 'hive_pause' }); say(`resume: ${n} stays benched ${r && r.error ? 'ERROR ' + r.error : 'ok'}`); }
    try { fs.renameSync(SNAP, SNAP.replace(/\.json$/, `_done_${Date.now()}.json`)); } catch (e) { }
    say(`RESUMED: ${snap.parties.length} parties (${snap.parties.join(', ') || '-'})`);
    return 0;
  }
  say('usage: node docs/plan/tools/hive_pause.js status | pause [--force] [why] | resume'); return 1;
}
main().then(c => process.exit(c || 0)).catch(e => { say('ERROR ' + e.message); process.exit(1); });
