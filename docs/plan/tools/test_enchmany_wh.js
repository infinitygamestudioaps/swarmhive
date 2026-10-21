// OFFLINE TEST of ENCHMANY-WH (owner 2026-10-20: "Its not under 'Clan Warehouse'"): "Enchant several" on the warehouse + clan warehouse.
//   node docs/plan/tools/test_enchmany_wh.js       (exit code 1 when a check fails)
// Live data, read only: the orders are MOCKED (nothing reaches a bot) and the one job file the success case writes is deleted again.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..'), LOGS = path.join(ROOT, 'Logs');
let fails = 0;
const t = (ok, what, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); if (!ok) fails++; };
(async () => {
  const A = require(path.join(ROOT, 'Dashboard', 'itemspage_api.js'));
  const states = []; for (const f of fs.readdirSync(LOGS)) { if (!/^swarm_state_.+\.json$/.test(f)) continue; try { const s = JSON.parse(fs.readFileSync(path.join(LOGS, f), 'utf8')); if (s && s.name) { s.ageSec = (Date.now() - Date.parse(s.updated)) / 1000; states.push(s); } } catch (e) { } }
  const sent = [];
  const CMDLOG = path.join(LOGS, 'dashboard_commands.log'), cmdLogSize = fs.existsSync(CMDLOG) ? fs.statSync(CMDLOG).size : 0;   // the success case appends one line: cut it off again (2026-10-20: test runs showed up as Scythe orders)
  const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(ROOT, 'Scripts', 'data'), LOGS, ROOT, readStates: () => states, readJson: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, commandRun: async (b) => { sent.push(b); return { body: { ok: true } }; } };
  const CL = (A.chars(ctx).chars.find(c => c.clanLeader) || {}).name;
  if (!CL) { console.log('skip: no clan leader on this install'); process.exit(0); }
  const C = await A.charInfo(ctx, CL, false);
  const ench = C.clan.filter(r => r.kind && r.grade && r.grade !== 'NONE' && !r.common);
  const low = ench.find(r => (Number(r.enchant) || 0) <= 2), over = ench.find(r => (Number(r.enchant) || 0) > 4 && (Number(r.enchant) || 0) < 10), rare = ench.find(r => (Number(r.enchant) || 0) >= 10);
  t(ench.length > 0, `clan warehouse has enchantable pieces (${ench.length})`);
  const pick = (r) => ({ src: 'clan', id: r.id, enchant: Number(r.enchant) || 0 });
  if (rare) { const r = await A.enchantMany(ctx, { name: CL, items: [pick(rare)], to: 20, overSafeOk: true }); t(r.code === 400 && /\+10 and higher/.test(r.error || '') && !sent.length, `+${rare.enchant} ${rare.name}: never taken out by "Enchant several" (locked)`, r); }
  if (over) { const r = await A.enchantMany(ctx, { name: CL, items: [pick(over)], to: (Number(over.enchant) || 0) + 1 }); t(r.code === 409 && r.needWarning && !sent.length, `${over.name} +${over.enchant} (above +4) needs the ticked warning`, r); }
  { const r = await A.enchantMany(ctx, { name: CL, items: [{ src: 'clan', id: 999999, enchant: 0 }], to: 3 }); t(r.code === 400 && /not in the clan warehouse/.test(r.error || '') && !sent.length, 'an item that is not in the clan warehouse is refused', r); }
  { const r = await A.enchantMany(ctx, { name: CL, items: [{ src: 'shop', id: 84 }], to: 3 }); t(r.code === 400 && !sent.length, 'shop items are refused', r); }
  if (low) {
    const n = C.clan.filter(r => r.id === low.id && (Number(r.enchant) || 0) === (Number(low.enchant) || 0)).reduce((s, r) => s + (Number(r.count) || 1), 0);
    const req = { name: CL, items: Array.from({ length: n + 1 }, () => pick(low)), to: 3 };
    let r = await A.enchantMany(ctx, req);
    if (r.scrollOptions) {   // ENCHSCROLLS: the scrolls are offered first, nothing taken / sent until the owner says yes
      t(r.code === 409 && !sent.length && r.scrollOptions.every(o => o.need > o.bag && (o.wh + o.clan) > 0), 'scrolls missing from the bag are OFFERED from the warehouses (nothing sent yet)', r);
      r = await A.enchantMany(ctx, Object.assign({}, req, { scrollsFrom: 'warehouses' }));
      t(r.ok && r.job.needs.length && r.job.needs.every(x => x.need > x.from.bag && x.from.wh + x.from.clan === x.need - x.from.bag), 'after "yes": the job fetches exactly the missing scrolls first', r.job && r.job.needs);
      // the public package has no Dashboard/data/items.json (made from the player's own client at setup): names fall back to "item <id>"
      const named = fs.existsSync(path.join(ROOT, 'Dashboard', 'data', 'items.json')), sid = r.ok && r.job.needs[0] && r.job.needs[0].id;
      t(r.ok && (named ? /^take \d+× .*Scroll: Enchant/ : new RegExp(`^take \\d+× (?:.*Scroll: Enchant|item ${sid} )`)).test(r.job.steps[0]), 'the first step says which scrolls come out of the warehouse', r.job && r.job.steps[0]);
    }
    if (r.ok) {
      const J = r.job; try { fs.unlinkSync(path.join(LOGS, 'itemjobs', r.id + '.json')); } catch (e) { }
      t(J.enchantMany.length === n && J.enchantMany.every(e => e.src === 'clan' && e.id === low.id && e.from === (Number(low.enchant) || 0)), `${n} identical piece(s) in the clan warehouse: ${n} taken, the extra pick skipped`, J.enchantMany);
      t(r.skipped.some(s => /not in the clan warehouse/.test(s)), 'the extra pick is reported as skipped');
      t(J.steps.some(s => s.startsWith(`take ${low.name}`) && /clan warehouse/.test(s)), 'the steps say the item is taken out of the clan warehouse first', J.steps);
      t(sent.length === 1 && /^!itemjob ij_/.test(sent[0].cmd) && sent[0].targets[0] === 'chars:' + CL, 'one (mocked) order to the clan leader', sent);
    } else t(/No scrolls|scroll/.test(r.error || ''), `no scroll for ${low.name} in ${CL}'s bag: refused with the reason (fine)`, r);
  }
  // the bag path still works as before (old objIds form)
  { const r = await A.enchantMany(ctx, { name: CL, objIds: [1], to: 3 }); t(r.code === 400 && /not in the bag/.test(r.error || ''), 'old bag-only request still answered the old way', r); }
  // swarm.js: warehouse pieces are fetched before the enchant, with the +4 / +10 guards
  const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  const i0 = SW.indexOf('ENCHMANY-WH 2026-10-20'), blk = SW.slice(i0, SW.indexOf('ijStatus(id, { state: okN === J.enchantMany.length', i0));
  t(i0 > 0 && /ijToGiran\(seq/.test(blk) && /ijFetch\(num\(e0\.id\)/.test(blk) && blk.indexOf('ijFetch(num(e0.id)') < blk.indexOf('for (const e of J.enchantMany)') && blk.indexOf('for (const e of J.enchantMany)') < blk.indexOf('ijEnchant('), 'bot: Giran trip, take EVERY piece out first, THEN enchant');
  t((blk.match(/\{ stay: true \}/g) || []).length >= 2 && /stayAtKeeper: stay/.test(SW), 'bot: stays at the warehouse keeper between takes (no walk back each time)');
  t(/WH_SAFE_ENCH && !J\.overSafeOk/.test(blk) && /WH_PROTECT_ENCH/.test(blk), 'bot: +4 needs the confirmed warning, +10 never');
  t(/for \(const n of \(J\.needs \|\| \[\]\)\) \{/.test(blk) && blk.indexOf('await ijFetch(num(n.id)') > 0 && blk.indexOf('await ijFetch(num(n.id)') < blk.indexOf('for (const e of J.enchantMany)') && blk.indexOf('J.needs || []).length') < blk.indexOf('for (const e of J.enchantMany)'), 'bot: the agreed scrolls are fetched before any enchant');
  const UI = fs.readFileSync(path.join(ROOT, 'Dashboard', 'itemspage.js'), 'utf8');
  t(/scrollOptions/.test(UI) && /scrollsFrom: 'warehouses'/.test(UI), 'the page asks before taking scrolls from a warehouse');
  t(/_active_\$\{me\}\.json/.test(SW) && /interrupted: true/.test(SW) && /never resumed on its own/.test(SW), 'a job cut off by a restart is closed honestly (interrupted), not resumed on its own');
  t(/if \(e\.result\) \{ if \(e\.result === 'reached'\) okN\+\+;/.test(SW) && /ijSaveJob\(J\)/.test(SW) && /onLvl\(lvl\)/.test(SW), 'every piece result + level is saved; a Resume skips finished pieces');
  t(/data-enpresume/.test(UI) && /'!itemjob ' \+ id/.test(UI), 'the Enchanting page offers Resume for a cut-off job');
  t((UI.match(/data-itmulti="\$\{S\.multi \? 0 : 1\}"/g) || []).length === 3, 'the page shows "Enchant several" on Bag, Warehouse and Clan warehouse');
  t(/S\.place === 'bag' \|\| S\.place === 'wh' \|\| S\.place === 'clan' \? multiBar\(\)/.test(UI) && /const mkey =/.test(UI), 'the tick box works on warehouse rows (own key)');
  try { if (fs.existsSync(CMDLOG) && fs.statSync(CMDLOG).size > cmdLogSize) { const buf = fs.readFileSync(CMDLOG); const extra = buf.slice(cmdLogSize).toString('utf8'); if (extra.split(/\r?\n/).filter(Boolean).every(l => /\titems\tjob ij_/.test(l))) fs.truncateSync(CMDLOG, cmdLogSize); } } catch (e) { }
  console.log(fails ? `\n${fails} FAILED` : '\nALL OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
