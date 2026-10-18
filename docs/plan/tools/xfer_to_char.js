// XFER-2026-10-17 (owner: "<account> - <character> needs to transfer ALL his items to Dagger1, also what they wear", 18 old characters):
// per account: temp config (old character, every script off) -> log in -> .giran -> unequip all -> trades of 10 to the receiver (adena last)
// -> back to the account's own config. The receiver stores into its OWN warehouse (!stash private) when its bag gets full.
// Real configs are never written. Log: Logs/xfer_<receiver>.log.  node xfer_to_char.js <Receiver> <Acct:OldChar> [<Acct:OldChar> ...]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..', '..');
const MCP = 'http://127.0.0.1:8083';
let headers = null, rid = 10;
async function post(body) {
  const r = await fetch(MCP, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = r.headers.get('mcp-session-id'); if (sid) headers['Mcp-Session-Id'] = sid;
  let t = await r.text(); if (/^\s*(event|data):/.test(t)) t = t.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join('');
  return JSON.parse(t);
}
async function call(tool, args) {
  if (!headers) { headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }; await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'xfer', version: '1' } } }); }
  const res = await post({ jsonrpc: '2.0', id: ++rid, method: 'tools/call', params: { name: tool, arguments: args } });
  if (res.error) return { error: res.error };
  if (res.result.structuredContent && !Array.isArray(res.result.structuredContent.result)) return res.result.structuredContent;
  const txt = (res.result.content || []).map(c => c.text).join('\n');
  try { return JSON.parse(txt); } catch (e) { return { text: txt, isError: res.result.isError }; }
}
const RX = process.argv[2], JOBS = process.argv.slice(3).map(s => s.split(':'));
const LOG = path.join(ROOT, 'Logs', `xfer_${String(RX).toLowerCase()}.log`);
const log = (...a) => { const s = new Date().toISOString() + ' ' + a.join(' '); console.log(s); fs.appendFileSync(LOG, s + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GIRAN = { x: 82800, y: 148600 };
const KEY = fs.readFileSync(path.join(ROOT, 'Dashboard', 'key.txt'), 'utf8').trim();
function dash(cmd, targets) {
  return new Promise(res => {
    const body = JSON.stringify({ cmd, targets, confirmDanger: true });
    const rq = http.request({ host: '127.0.0.1', port: 8090, path: '/api/command?key=' + KEY, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
    rq.on('error', e => res('error ' + e.message)); rq.end(body);
  });
}
const rdXml = p => { const b = fs.readFileSync(p); return b[0] === 0xFF ? b.slice(2).toString('utf16le') : b.toString('utf8'); };
const wrXml = (p, t) => fs.writeFileSync(p, Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(t, 'utf16le')]));
const st = async (sel) => { const s = await call('get_account_status', sel); return s && s.character ? s : null; };
const inv = async (sel) => { const r = await call('get_account_data', Object.assign({ type: 'inventory' }, sel)); return Array.isArray(r) ? r : (r.items || r.inventory || r.result || []); };
const act = (sel, action, params) => call('send_game_action', Object.assign({ action }, sel, params ? { params } : {}));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let ABORT = false, CUR_G = null;
const MAXK = Number(process.env.XFER_MAXKINDS || 90);   // Dagger1 held 86 kinds on 2026-10-17: the bag limit is above 80
const ONLY_TEST = process.env.XFER_DRY === '1';

async function goNear(gsel, rsel) {
  for (let i = 0; i < 6; i++) {
    const g = await st(gsel), r = await st(rsel); if (!g || !r) return false;
    if (dist(g.character, r.character) < 120) return true;
    await act(gsel, 'pathfind_move', { x: r.character.x + 40, y: r.character.y, z: r.character.z });
    for (let k = 0; k < 15; k++) { await sleep(1500); const g2 = await st(gsel); if (g2 && dist(g2.character, r.character) < 120) return true; }
  }
  return false;
}
async function roomCheck(rsel, need) {
  const items = await inv(rsel);
  if (items.length + need <= MAXK) return true;   // stop well before a full bag (80 / dwarf 100)
  // owner 20:52: "Deposit materials in clan warehouse and sell things marked for sale" -> first !sell (marked + junk), then !stash clan
  log(`  ${RX} has ${items.length} kinds - selling marked items (!sell), then storing in the clan warehouse (!stash clan)`);
  try { for (const sel of [rsel].concat(CUR_G ? [CUR_G] : [])) await act(sel, 'trade_done', { answer: 0 }); } catch (e) { } await sleep(1500);   // no open trade window before the shop (server #149)
  const t0 = new Date().toISOString();
  if (process.env.XFER_SELL !== '0') log('  ' + String(await dash('!sell ' + RX, ['char:' + RX])).slice(0, 120));
  // wait for the sell's result line in Logs/swarm_buffs.log ("sell: done ...", "nothing to sell", "no merchant ..."), max 6 min:
  // a newer order (the !stash) would interrupt the walk to the merchant
  const notes = path.join(ROOT, 'Logs', 'swarm_buffs.log'); let res = '';
  for (let i = 0; i < 72 && !res && process.env.XFER_SELL !== '0'; i++) {
    await sleep(5000);
    try {
      const tail = fs.readFileSync(notes, 'utf8').slice(-60000).split('\n');
      const hit = tail.filter(l => l.slice(0, 24) > t0 && l.includes(`[${RX}] sell`) && !/walking to the nearest|^\S+ \[[^\]]+\] sell: [^—]*x\d+.*$/.test(l) ).pop();
      if (hit && /done|nothing|no merchant|not|sold|færdig|could/i.test(hit)) res = hit.slice(25, 200);
    } catch (e) { }
  }
  log(`  sell: ${res || 'no result line within 6 min'} | bag ${(await inv(rsel)).length} kinds`);
  // owner 2026-10-18: "store what materials is already there [clan warehouse] and store the armor and weapons in his private one. Then sell all
  // items marked before": per trip the receiver's stash rule (stash_rules.json chars.<RX>) gets an exact id list: deposit = this trip's items,
  // keep = everything else in the bag; clan trip = kinds already in the clan warehouse (Logs/clan_state.json snapshot), not weapons / armor;
  // private trip = weapons, armor and everything new. His own consumables (keepNames) and worn gear stay. The original rule comes back after.
  const RF = path.join(ROOT, 'Scripts', 'data', 'stash_rules.json');
  const rules0 = JSON.parse(fs.readFileSync(RF, 'utf8')); const orig = rules0.chars && rules0.chars[RX] ? JSON.parse(JSON.stringify(rules0.chars[RX])) : null;
  const keepRe = ((orig && orig.keepNames) || []).map(x => { try { return new RegExp(x, 'i'); } catch (e) { return null; } }).filter(Boolean);
  let clanSet = new Set(); try { const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'Logs', 'clan_state.json'), 'utf8')); const W = (c.warehouse && (c.warehouse.items || c.warehouse)) || []; (Array.isArray(W) ? W : []).forEach(w => clanSet.add(Number(w.id))); } catch (e) { }
  const setRule = (o) => { const R = JSON.parse(fs.readFileSync(RF, 'utf8')); R.chars = R.chars || {}; if (o) R.chars[RX] = o; else if (orig) R.chars[RX] = orig; else delete R.chars[RX]; R._updated = new Date().toISOString(); fs.writeFileSync(RF, JSON.stringify(R, null, 1)); };
  try {
    const bag = await inv(rsel);
    const dep = bag.filter(i => !i.is_equipped && !i.is_quest && Number(i.item_id) !== 57 && !keepRe.some(r => r.test(String(i.name))));
    const gear = (i) => /weapon|armor/i.test(String(i.type || ''));
    const clanIds = [...new Set(dep.filter(i => !gear(i) && clanSet.has(Number(i.item_id))).map(i => Number(i.item_id)))];
    const privIds = [...new Set(dep.filter(i => !clanIds.includes(Number(i.item_id))).map(i => Number(i.item_id)))];
    const allIds = [...new Set(bag.map(i => Number(i.item_id)))];
    log(`  storing: ${clanIds.length} kinds to the clan warehouse (already there), ${privIds.length} kinds (weapons / armor / new) to ${RX}'s own warehouse`);
    for (const [dest, ids] of [['clan', clanIds], ['private', privIds]]) {
      if (!ids.length) continue;
      setRule(Object.assign({}, orig || {}, { dest, mode: 'rules', deposit: ids, keep: allIds.filter(x => !ids.includes(x)), depositNames: [], keepNames: (orig && orig.keepNames) || [] }));
      await sleep(15000);                                          // the bots re-read stash_rules.json
      log('  ' + String(await dash('!stash ' + dest + ' ' + RX, ['char:' + RX])).slice(0, 100));
      let last = -1, same = 0;
      for (let i = 0; i < 60; i++) { await sleep(5000); const b2 = await inv(rsel); const left = b2.filter(x => ids.includes(Number(x.item_id))).length; if (!left) break; same = left === last ? same + 1 : 0; last = left; if (same >= 24) break; }
      const b3 = await inv(rsel); log(`  ${dest} warehouse: ${ids.length - b3.filter(x => ids.includes(Number(x.item_id))).length}/${ids.length} kinds stored, bag ${b3.length} kinds`);
    }
  } finally { setRule(null); }
  const nNow = (await inv(rsel)).length; if (nNow + need <= MAXK) { log(`  ${RX} now ${nNow} kinds`); await sleep(5000); return true; }
  log(`  ${RX} still too full after 12 min`); return false;
}
async function tradeBatch(gsel, rsel, rxObj, batch) {
  await act(gsel, 'trade_request', { obj_id: rxObj }); await sleep(2500);
  try { await act(rsel, 'trade_answer', { answer: 1 }); } catch (e) { } await sleep(1800);
  for (const it of batch) { await act(gsel, 'trade_add_item', { obj_id: it.obj_id, count: Number(it.count) }); await sleep(400); }
  await sleep(1500); await act(gsel, 'trade_done', { answer: 1 }); await sleep(1500);
  await act(rsel, 'trade_done', { answer: 1 }); await sleep(3500);
  const after = await inv(gsel), left = new Set(after.map(i => String(i.obj_id)));
  const moved = batch.filter(i => !left.has(String(i.obj_id)));
  if (!moved.length) { try { await act(gsel, 'trade_done', { answer: 0 }); await act(rsel, 'trade_done', { answer: 0 }); } catch (e) { } await sleep(1500); }   // never leave a window open
  return { moved, left };
}
(async () => {
  const rsel = { account_name: RX }; const r0 = await st(rsel); if (!r0) { log('receiver not online'); return; }
  const rxObj = r0.character.obj_id; log(`receiver ${RX} obj ${rxObj} at ${r0.character.x},${r0.character.y}`);
  for (const [acct, old] of JOBS) {
    if (ABORT) { log(`=== skipped ${acct} -> ${old} (run stopped)`); continue; }
    const real = path.join(ROOT, 'Settings', acct + '.xml'), tmp = path.join(ROOT, 'Settings', 'xfer', acct + '_xfer.xml');
    log(`=== ${acct} -> ${old}`);
    let switched = false;
    try {
      let t = rdXml(real);
      if (!/<SelectedCharacter>/.test(t)) throw new Error('no SelectedCharacter in ' + acct);
      t = t.replace(/<SelectedCharacter>[^<]*<\/SelectedCharacter>/, `<SelectedCharacter>${old}</SelectedCharacter>`);
      t = t.replace(/(<ScriptsList>[\s\S]*?<\/ScriptsList>)/, m => m.replace(/<IsEnabled>true<\/IsEnabled>/g, '<IsEnabled>false</IsEnabled>'));
      wrXml(tmp, t);
      log('  close ' + JSON.stringify(await call('close_account', { config_path: real })).slice(0, 120)); await sleep(6000);
      switched = true;
      const op = await call('open_account', { config_path: tmp });
      log('  open ' + JSON.stringify(op).slice(0, 160));
      const gsel = op && op.account_id ? { account_id: op.account_id } : { config_path: tmp }; let g = null; CUR_G = gsel;
      for (let i = 0; i < 60; i++) {
        await sleep(3000);
        const raw = await call('get_account_status', gsel); g = raw && raw.character ? raw : null;
        if (i % 10 === 9) log('  waiting: ' + JSON.stringify(raw).slice(0, 220));
        if (g && g.is_logged_in && g.character.name) break;
      }
      if (!g || g.character.name !== old) { log(`  FAILED: logged in as ${g && g.character.name || 'nobody'}, not ${old}`); throw new Error('wrong character'); }
      await act(gsel, 'raw_packet', { hex: '3A' }).catch(() => { }); await sleep(1500);
      await call('run_account_command', Object.assign({ command: '/disablebot' }, gsel)).catch(() => { });
      log(`  ${old} lvl ${g.character.level} at ${g.character.x},${g.character.y} adena ${g.adena} dead ${g.character.is_dead}`);
      if (g.character.is_dead) {   // logged out dead (Duswyn 2026-10-18): respawn in the village first (RequestRestartPoint 0)
        await act(gsel, 'raw_packet', { hex: '7D00000000' }).catch(() => { }); await sleep(10000); await act(gsel, 'raw_packet', { hex: '3A' }).catch(() => { }); await sleep(2000); g = await st(gsel) || g; log(`  respawned: dead ${g.character.is_dead} at ${g.character.x},${g.character.y}`);
      }
      if (dist(g.character, GIRAN) > 6000) {
        for (let k = 0; k < 3 && dist(g.character, GIRAN) > 6000; k++) {
          await call('run_account_command', Object.assign({ command: '.giran' }, gsel)); await sleep(12000);
          await act(gsel, 'raw_packet', { hex: '3A' }).catch(() => { }); await sleep(2000); g = await st(gsel);
        }
        // owner 2026-10-18 (option 2): stuck where monsters hit them (inside the Tower of Insolence) -> let them die, respawn in town, .giran
        if (dist(g.character, GIRAN) > 6000 && process.env.XFER_DIE === '1') {
          log('  .giran refused (monsters on me) - standing still until I die, then respawning in town');
          for (let k = 0; k < 60 && !(g && g.character.is_dead); k++) { await sleep(5000); g = await st(gsel) || g; }
          if (g.character.is_dead) { await act(gsel, 'raw_packet', { hex: '7D00000000' }).catch(() => { }); await sleep(10000); await act(gsel, 'raw_packet', { hex: '3A' }).catch(() => { }); await sleep(3000); g = await st(gsel) || g; log(`  respawned at ${g.character.x},${g.character.y}`);
            for (let k = 0; k < 3 && dist(g.character, GIRAN) > 6000; k++) { await call('run_account_command', Object.assign({ command: '.giran' }, gsel)); await sleep(12000); await act(gsel, 'raw_packet', { hex: '3A' }).catch(() => { }); await sleep(2000); g = await st(gsel) || g; } }
        }
        if (dist(g.character, GIRAN) > 6000) { log(`  FAILED: could not get to Giran (at ${g.character.x},${g.character.y})`); throw new Error('no giran'); }
        log(`  in Giran at ${g.character.x},${g.character.y}`);
      }
      let items = await inv(gsel); const worn = items.filter(i => i.is_equipped);
      for (const w of worn) { await act(gsel, 'use_item', { obj_id: w.obj_id }); await sleep(500); }
      if (worn.length) { await sleep(1500); items = await inv(gsel); log(`  unequipped ${worn.length}, still worn ${items.filter(i => i.is_equipped).length}`); }
      const give = items.filter(i => !i.is_equipped && !i.is_quest && Number(i.item_id) !== 57);
      const adena = items.find(i => Number(i.item_id) === 57);
      log(`  to give: ${give.length} kinds + ${adena ? adena.count : 0} adena (quest items kept: ${items.filter(i => i.is_quest).length})`);
      if (ONLY_TEST) { log('  dry run: no trades'); throw new Error('dry run'); }
      // 3 passes over what is still in the bag: a failed batch (receiver busy right after storing) is simply tried again in the next pass;
      // only the last pass tries the leftovers one by one, and what still does not move counts as untradeable
      const skipped = []; let stop = false;
      const tradeable = async () => (await inv(gsel)).filter(i => !i.is_equipped && !i.is_quest && Number(i.item_id) !== 57 && !skipped.includes(i.name));
      for (let pass = 1; pass <= 3 && !stop; pass++) {
        let queue = await tradeable(); if (!queue.length) break;
        if (pass > 1) log(`  pass ${pass}: ${queue.length} kinds still to give`);
        const size = pass < 3 ? 10 : 1;
        while (queue.length) {
          const batch = queue.slice(0, size); queue = queue.slice(size);
          let room = false; for (let k = 0; k < 3 && !room; k++) room = await roomCheck(rsel, batch.length);
          if (!room) { log('  STOPPED: receiver bag full - the whole run stops here'); stop = true; ABORT = true; break; }
          if (!(await goNear(gsel, rsel))) { log('  could not get next to ' + RX); stop = true; break; }
          try { await act(gsel, 'trade_done', { answer: 0 }); await act(rsel, 'trade_done', { answer: 0 }); } catch (e) { }   // no stale trade window
          await sleep(600);
          const res = await tradeBatch(gsel, rsel, rxObj, batch);
          log(`  trade: ${res.moved.length}/${batch.length} moved (${res.moved.map(i => i.name).join(', ').slice(0, 220)})`);
          if (!res.moved.length) { if (pass === 3) skipped.push(batch[0].name); else await sleep(4000); }
        }
      }
      const ad = (await inv(gsel)).find(i => Number(i.item_id) === 57);
      if (ad && Number(ad.count) > 0 && (await goNear(gsel, rsel))) {
        await tradeBatch(gsel, rsel, rxObj, [{ obj_id: ad.obj_id, item_id: 57, name: 'Adena', count: ad.count }]);
        const ad2 = (await inv(gsel)).find(i => Number(i.item_id) === 57);
        log(`  adena: ${ad.count} -> ${ad2 ? ad2.count : 0} left`);
      }
      const rest = await inv(gsel);
      log(`  DONE ${old}: left on him ${rest.length} kinds: ${rest.map(i => i.name + (i.is_quest ? ' (quest)' : '') + (Number(i.count) > 1 ? ' x' + i.count : '')).join(', ').slice(0, 400)}${skipped.length ? ' | untradeable: ' + skipped.join(', ') : ''}`);
    } catch (e) { log('  ERROR ' + (e && e.message || e)); }
    finally {
      if (switched) {
        try { await call('close_account', { config_path: tmp }); } catch (e) { } await sleep(6000);
        log('  back: ' + JSON.stringify(await call('open_account', { config_path: real })).slice(0, 120));
        await sleep(20000);   // login gap
      }
    }
  }
  log('ALL DONE');
})();
