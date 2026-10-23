// OFFLINE TEST of BUYMANY-2026-10-23 (owner: "Under /items/ I need to be able to purchase multiple items"): several Giran shop items in ONE job.
//   node docs/plan/tools/test_buymany.js       (exit code 1 when a check fails)
// Live data, read only: the orders are MOCKED (nothing reaches a bot); the job file and the command-log line the success case writes are removed again.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..'), LOGS = path.join(ROOT, 'Logs');
let fails = 0;
const t = (ok, what, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); if (!ok) fails++; };
(async () => {
  const A = require(path.join(ROOT, 'Dashboard', 'itemspage_api.js'));
  const PAGE = fs.readFileSync(path.join(ROOT, 'Dashboard', 'itemspage.js'), 'utf8');
  const SW = fs.readFileSync(path.join(ROOT, fs.existsSync(path.join(ROOT, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js'), 'utf8');
  // wiring (always checked, also in the public package)
  t(typeof A.buyMany === 'function', 'the API has buyMany (/api/items/buymany)');
  t(/if \(sub === 'buymany' && req\.method === 'POST'\) return out\(await buyMany\(ctx, b\)\)/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'itemspage_api.js'), 'utf8')), 'POST /api/items/buymany is routed');
  t(/data-itbuy=/.test(PAGE) && /function cartBar\(\)/.test(PAGE) && /\/api\/items\/buymany/.test(PAGE), 'the Giran shops tab has "Buy several" + the buy list + one button');
  t(/if \(r && r\.needWarning\) \{ const yes = await uiConfirm/.test(PAGE), 'a big amount / a grade too high asks first (shared dialog, no browser confirm)');
  t(/if \(Array\.isArray\(J\.buyMany\) && J\.buyMany\.length\) \{/.test(SW) && /x\.result = r && r\.ok \? 'bought' : 'failed';[^\n]*ijSaveJob\(J\);/.test(SW), 'the bot: one Giran trip, each item at its NPC, results saved per item (a cut-off job resumes)');
  t(/const left = J\.buyMany\.filter\(x => x\.result !== 'bought'\);/.test(SW), 'a resumed job buys only what is left');
  // live data (owner install): needs the Giran shop list and a character with adena
  const states = []; try { for (const f of fs.readdirSync(LOGS)) { if (!/^swarm_state_.+\.json$/.test(f)) continue; try { const s = JSON.parse(fs.readFileSync(path.join(LOGS, f), 'utf8')); if (s && s.name) { s.ageSec = (Date.now() - Date.parse(s.updated)) / 1000; states.push(s); } } catch (e) { } } } catch (e) { }
  const sent = [];
  const CMDLOG = path.join(LOGS, 'dashboard_commands.log'), cmdLogSize = fs.existsSync(CMDLOG) ? fs.statSync(CMDLOG).size : 0;
  const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(ROOT, 'Scripts', 'data'), LOGS, ROOT, readStates: () => states, readJson: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, commandRun: async (b) => { sent.push(b); return { body: { ok: true } }; } };
  const rows = [].concat(...A.shops(ctx).shops.map(s => s.rows)).filter(r => !r.cost && r.price > 0);
  const cheap = rows.filter(r => r.price < 200).slice(0, 2), dear = rows.find(r => r.price >= 100), exch = [].concat(...A.shops(ctx).shops.map(s => s.rows)).find(r => r.cost);
  const rich = (A.chars(ctx).chars || []).find(c => c.online !== false && c.name);
  if (cheap.length < 2 || !rich) { console.log('skip live part: no Giran shop list / no character on this install'); console.log(fails ? `\n${fails} FAILED` : '\nall checks passed'); process.exit(fails ? 1 : 0); }
  const C = await A.charInfo(ctx, rich.name, false);
  { const r = await A.buyMany(ctx, { name: rich.name, items: [] }); t(r.code === 400 && !sent.length, 'an empty list is refused', r); }
  { const r = await A.buyMany(ctx, { name: rich.name, items: [{ id: 999999, count: 1 }] }); t(r.code === 400 && /no Giran NPC sells it/.test(r.error || '') && !sent.length, 'an item no NPC sells is refused', r); }
  if (exch) { const r = await A.buyMany(ctx, { name: rich.name, items: [{ id: exch.id, count: 1, npc: exch.npc }] }); t(r.code === 400 && /exchange/.test(r.error || '') && !sent.length, 'an exchange (costs other items) is not in a buy list', r); }
  if (dear) { const r = await A.buyMany(ctx, { name: rich.name, items: [{ id: dear.id, count: 100000, npc: dear.npc }] }); const tooMuch = Math.ceil(dear.price * 100000 * 1.2) > (Number(C.adena) || 0);
    t(r.code === 409 && !sent.length && (tooMuch ? /not enough|adena first|remove items/.test(r.error || '') : r.needWarning), 'a list it cannot afford / a big amount is never sent without the owner', r); }
  if ((Number(C.adena) || 0) > 2000) {
    const r = await A.buyMany(ctx, { name: rich.name, items: cheap.map(x => ({ id: x.id, count: 1, npc: x.npc, path: x.offer ? x.offer.path : '' })) });
    if (r.ok) {
      try { fs.unlinkSync(path.join(LOGS, 'itemjobs', r.id + '.json')); } catch (e) { }
      t(r.job.buyMany.length === 2 && r.job.buyMany.every((x, i) => x.id === cheap[i].id && x.count === 1), 'two items -> ONE job with both', r.job.buyMany);
      t(sent.length === 1 && sent[0].cmd === `!itemjob ${r.id}` && sent[0].targets[0] === 'chars:' + rich.name, 'one !itemjob order to the doer only', sent);
      t(r.job.steps[0] === `${rich.name} goes to Giran once`, 'the steps say: one trip', r.job.steps);
    } else t(r.needWarning === true, 'success path (or the level / amount warning first)', r);
  }
  try { if (fs.existsSync(CMDLOG) && fs.statSync(CMDLOG).size > cmdLogSize) fs.truncateSync(CMDLOG, cmdLogSize); } catch (e) { }
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exit(1); });
