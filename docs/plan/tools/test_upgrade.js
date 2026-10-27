// OFFLINE TEST of UPGRADE-2026-10-25 (owner: "select a character then ask it to go get upgrades in town ... more than just a weapon ... equip
// them, then give your other spare items to the collector ... an entire raid"): several items, several characters, one trip each.
//   node docs/plan/tools/test_upgrade.js       (exit code 1 when a check fails)
// Live data, read only: orders are MOCKED (nothing reaches a bot); job files and command-log lines the start case writes are removed again.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..'), LOGS = path.join(ROOT, 'Logs');
let fails = 0;
const t = (ok, what, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); if (!ok) fails++; };
(async () => {
  const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  const API = fs.readFileSync(path.join(ROOT, 'Dashboard', 'upgrade_api.js'), 'utf8'), PAGE = fs.readFileSync(path.join(ROOT, 'Dashboard', 'upgradepage.js'), 'utf8');
  // ---- bot side (static) ----
  const run = SW.slice(SW.indexOf('async function upgradeRun('), SW.indexOf('async function itemJobOrder('));
  t(run.length > 500 && /if \(J\.upgrade && Array\.isArray\(J\.upgrade\.lines\)\) \{ try \{ trip = await upgradeRun\(J, id, seq\); \}/.test(SW), 'A1 an upgrade job runs upgradeRun before the other doer kinds');
  // UPGSOLO-2026-10-25: a solo job = away like a scout, never the party hold; the away flag is cleared when the job ends (rejoin)
  { const g = SW.slice(SW.indexOf('async function ijToGiran('), SW.indexOf('async function ijToGiran(') + 4000);
    t(/if \(opt && opt\.solo && team && !isLeader\(\)\) \{\s*o\.solo = true; scoutAway\(true\)/.test(g) && g.indexOf('opt.solo') < g.indexOf("swarm.kitbuy.trip"), 'A10 a solo member goes away (scout flag) before any party hold is asked');
    t(/finally \{ if \(J\.solo\) \{ try \{ scoutAway\(false\)/.test(SW), 'A11 the away flag is cleared when the solo job ends (the rejoin takes it back)'); }
  t(/const trip = await ijToGiran\(seq, '!itemjob', \{ solo: !!J\.solo \}\);/.test(run) && (run.match(/ijToGiran\(/g) || []).length === 1, 'A2 ONE Giran trip for all lines');
  t(/if \(l\.result === 'done'\) \{ res\.push/.test(run) && /l\.result = 'done'; l\.worn = !!on; ijSaveJob\(J\);/.test(run), 'A3 every line result is saved; a resumed job skips finished lines');
  t(/const fail = \(why\) => \{ l\.result = 'failed';[^\n]*going on with the next piece/.test(run), 'A4 one failed line does not stop the others');
  t(/worn0\.has\(o\) && !nowWorn\.has\(o\) && !keep\.has\(o\)/.test(run), 'A5 only pieces worn before, taken off by the new ones (and not a new piece) go to the collector');
  t(/const UPGRADE_GIVE_REPLACED = false;/.test(SW) && /col !== me && UPGRADE_GIVE_REPLACED/.test(run), 'A6 KEEPOLD (owner 2026-10-26): the replaced pieces stay in my bag (no hand-over, no sale)');
  t(/it\.src === 'char'\) objId = ijFind\(it\.id, null, keep\)/.test(run) && /const nd = await ijNeeds\(l\.needs, id\)/.test(run), 'A7 another character\'s piece arrives through the needs step (CHARSRC hand-over) first');
  t(/num\(it\.enchant\) > WH_SAFE_ENCH && !J\.overSafeOk/.test(run) && /ijEnchant\(objId, num\(l\.enchant\.to\), num\(l\.enchant\.scroll\), id, it\.name, !!J\.overSafeOk\)/.test(run), 'A8 the safe +4 rule holds (warehouse pieces and enchanting)');
  t(/if \(e\.gone\) \{ fail\(e\.why\); continue; \}/.test(run), 'A9 a destroyed item ends only that line');
  // ---- page + API wiring ----
  t(/\/api\/upgrade\/plan/.test(PAGE) && /\/api\/upgrade\/start/.test(PAGE) && /uiConfirm/.test(PAGE) && !/\bconfirm\(|alert\(|prompt\(/.test(PAGE.replace(/uiConfirm\(/g, '')), 'B1 the page plans, asks with the shared dialog, never a browser confirm');
  t(/the replaced pieces stay in this character's bag/.test(PAGE), 'B2 the page says the replaced pieces stay in the bag');
  t(/data-uuse=/.test(PAGE) && /use\.wh && Number\(o\.wh\)/.test(API), 'B3 materials only from the sources the owner ticked');
  // ---- server (live data, mocked orders) ----
  const A = require(path.join(ROOT, 'Dashboard', 'itemspage_api.js')), U = require(path.join(ROOT, 'Dashboard', 'upgrade_api.js'));
  const states = []; try { for (const f of fs.readdirSync(LOGS)) { if (!/^swarm_state_.+\.json$/.test(f)) continue; try { const s = JSON.parse(fs.readFileSync(path.join(LOGS, f), 'utf8').replace(/^﻿/, '')); if (s && s.name) states.push(s); } catch (e) { } } } catch (e) { }
  const sent = [], CMDLOG = path.join(LOGS, 'dashboard_commands.log'), cmdLogSize = fs.existsSync(CMDLOG) ? fs.statSync(CMDLOG).size : 0;
  const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(ROOT, 'Scripts', 'data'), LOGS, ROOT, readStates: () => states, readJson: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } },
    commandRun: async (o) => { sent.push(o); return { ok: true }; } };
  const rows = [].concat(...A.shops(ctx).shops.map(s => s.rows)).filter(r => !r.cost && r.price > 0);
  const cheap = rows.filter(r => r.kind && !r.common).sort((a, b) => a.price - b.price).slice(0, 2);
  const rich = (A.chars(ctx).chars || []).filter(c => c.name && Number(c.adena) > 3 * (cheap.reduce((t, x) => t + x.price, 0) + 1000)).sort((a, b) => b.adena - a.adena).slice(0, 2);
  if (cheap.length < 2 || rich.length < 2) { console.log('skip live part: no Giran shop list / two characters with adena'); }
  else {
    const order = { orders: rich.map(c => ({ name: c.name, lines: cheap.map(x => ({ item: { src: 'shop', id: x.id, offer: x.offer }, enchantTo: 0 })) })), use: { wh: false, clan: false, buy: false } };
    const P = await U.planAll(ctx, order);
    t(P.orders && P.orders.length === 2 && P.orders.every(o => o.lines.length === 2), 'C1 two characters x two items planned', P);
    t(P.orders.every(o => o.lines.every(l => (l.steps || []).some(s => /puts it on/.test(s)))), 'C2 every line ends with "puts it on"', P.orders[0] && P.orders[0].lines[0]);
    t(!sent.length, 'C3 planning sends nothing');
    const S = await U.start(ctx, Object.assign({ when: 'party' }, order));   // UPGQUEUE: 'party' = sent at once (the default waits for the next town visit)
    const made = (S.started || []).map(x => x.id);
    try {
      t(S.ok && made.length === (P.orders.filter(o => o.ok).length), 'C4 one job per ready character', S);
      if (made.length) {
        const J = JSON.parse(fs.readFileSync(path.join(LOGS, 'itemjobs', made[0] + '.json'), 'utf8'));
        t(J.upgrade && J.upgrade.lines.length === 2 && J.upgrade.lines.every(l => l.wear === true && l.item.src === 'shop'), 'C5 the job holds both lines (to wear)', J.upgrade);
        t(sent.length === made.length && sent.every(s => /^!itemjob ij_[a-z0-9_]+$/.test(s.cmd)), 'C6 one !itemjob order per character', sent);
        t(J.upgrade.collector === (U.collectorName(ctx) === J.doer ? '' : U.collectorName(ctx)), 'C7 the collector from the Storage page (never the doer itself)', J.upgrade.collector);
        const st = U.status(ctx, made.join(','));
        t(st.jobs.length === made.length && st.jobs[0].lines.length === 2, 'C8 the status lists every line', st);
      }
    } finally { made.forEach(id => { ['', '_status'].forEach(x => { try { fs.unlinkSync(path.join(LOGS, 'itemjobs', id + x + '.json')); } catch (e) { } }); }); try { if (fs.existsSync(CMDLOG) && fs.statSync(CMDLOG).size > cmdLogSize) fs.truncateSync(CMDLOG, cmdLogSize); } catch (e) { } }
    // ---- UPGQUEUE-2026-10-25: wait for the next Giran visit (default), the dispatcher, Send now (party / alone), cancel ----
    { const who = rich[0].name, field = { name: who, ageSec: 5, x: 113464, y: 16552, party: 'Somebody', leader: false, dead: false, combat: false, mode: '' }   /* live-independent: the real character may be dead / in a raid right now */, sent0 = sent.length;
      const real = states.find(x => x.name === who) || {}; field.level = real.level; field.classId = real.classId; field.cls = real.cls; field.adena = real.adena;
      let st2 = [field]; const ctx2 = Object.assign({}, ctx, { readStates: () => states.filter(x => x.name !== who).concat(st2.map(x => Object.assign({}, real, x))) });
      const one = { orders: [order.orders[0]], use: order.use }, made2 = [];
      try {
        const Q = await U.start(ctx2, one); (Q.started || []).forEach(x => made2.push(x.id));
        const id = made2[0], J = id && JSON.parse(fs.readFileSync(path.join(LOGS, 'itemjobs', id + '.json'), 'utf8'));
        t(Q.ok && Q.when === 'town' && J && J.queued && sent.length === sent0, 'G1 by default the order waits (queued, nothing sent)', Q);
        t(U.status(ctx2, id).jobs[0].state === 'queued' && U.jobsFor(ctx2, who).jobs.some(j => j.id === id && j.queued), 'G2 the status + the character\'s job list say queued');
        t((await U.dispatchTick(ctx2)).length === 0 && sent.length === sent0, 'G3 in the field: the dispatcher sends nothing');
        st2 = [Object.assign({}, field, { combat: true, x: 82000, y: 148000 })];
        t((await U.dispatchTick(ctx2)).length === 0, 'G4 in Giran but fighting: still waits');
        st2 = [Object.assign({}, field, { x: 82000, y: 148000 })];
        const d = await U.dispatchTick(ctx2), J2 = JSON.parse(fs.readFileSync(path.join(LOGS, 'itemjobs', id + '.json'), 'utf8'));
        t(d.length === 1 && d[0] === id && !J2.queued && sent.length === sent0 + 1 && sent[sent.length - 1].cmd === '!itemjob ' + id, 'G5 in Giran: the dispatcher sends it once', d);
        t((await U.dispatchTick(ctx2)).length === 0, 'G6 never sent twice');
        const Q2 = await U.start(ctx2, one); (Q2.started || []).forEach(x => made2.push(x.id)); const id2 = Q2.started[0].id;
        const r1 = await U.sendNow(ctx2, { id: id2, mode: 'solo' }), J3 = JSON.parse(fs.readFileSync(path.join(LOGS, 'itemjobs', id2 + '.json'), 'utf8'));
        t(r1.ok && r1.solo && J3.solo === true && !J3.queued && sent[sent.length - 1].cmd === '!itemjob ' + id2, 'G7 Send now, alone: a member goes alone', r1);
        t((await U.sendNow(ctx2, { id: id2, mode: 'party' })).code === 409, 'G8 a sent job cannot be sent again');
        st2 = [Object.assign({}, field, { leader: true, party: who })];
        const Q3 = await U.start(ctx2, one); (Q3.started || []).forEach(x => made2.push(x.id)); const id3 = Q3.started[0].id;
        const r2 = await U.sendNow(ctx2, { id: id3, mode: 'solo' });
        t(r2.ok && !r2.solo && r2.leaderTakesParty, 'G9 a party leader never goes alone (his party comes along)', r2);
        const Q4 = await U.start(ctx2, one); (Q4.started || []).forEach(x => made2.push(x.id)); const id4 = Q4.started[0].id, n4 = sent.length;
        const r3 = await U.sendNow(ctx2, { id: id4, cancel: true });
        t(r3.ok && sent.length === n4 && U.status(ctx2, id4).jobs[0].result === 'cancelled' && (await U.dispatchTick(ctx2)).length === 0, 'G10 cancel: nothing sent, never dispatched later');
        t(U.inGiran({ x: 82698, y: 148638 }) && !U.inGiran({ x: 15757, y: 144638 }), 'G11 the Giran box (not Dion)');
      } finally { made2.forEach(id => { ['', '_status'].forEach(x => { try { fs.unlinkSync(path.join(LOGS, 'itemjobs', id + x + '.json')); } catch (e) { } }); }); try { if (fs.existsSync(CMDLOG) && fs.statSync(CMDLOG).size > cmdLogSize) fs.truncateSync(CMDLOG, cmdLogSize); } catch (e) { } }
    }
    const bad = await U.planAll(ctx, { orders: [{ name: rich[0].name, lines: [{ item: { src: 'char', id: cheap[0].id, char: rich[0].name } }] }] });
    t(bad.orders[0].lines[0].error, 'C9 "from another character" may not be the character itself', bad.orders[0].lines[0]);
  }
  // ---- AUGMENT-2026-10-25: packets + the never-resend rule ----
  { const a = SW.indexOf('const AUG = {'), z = SW.indexOf('/** augment objId with aug');
    const E = new Function('num', SW.slice(a, z) + '\nreturn { AUG, augParse };')((v) => Number(v) || 0);
    const pk = (sub, ds) => { const w = [0, 0, 0xFE, sub, 0]; ds.forEach(v => w.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255)); return w; };
    E.augParse(pk(0x56, [16344, 14950, 1])); t(E.AUG.res && E.AUG.res.o1 === 16344 && E.AUG.res.o2 === 14950 && E.AUG.res.ok, 'D1 ExVariationResult FE:56 -> both bonus ids + ok', E.AUG.res);
    E.augParse(pk(0x56, [0, 0, 0])); t(E.AUG.res && !E.AUG.res.ok, 'D2 result 0 = refused');
    E.augParse(pk(0x58, [1])); t(E.AUG.cres && E.AUG.cres.ok, 'D3 ExVariationCancelResult FE:58');
    const fn = SW.slice(z, SW.indexOf('/** MAKEX-2026-10-25'));
    t((fn.match(/Send\.RequestRefine\(/g) || []).length === 1 && /if \(!AUG\.res\) return \{[^\n]*nothing resent/.test(fn) && /if \(!AUG\.cres\) return/.test(fn), 'D4 one augment request per try; a missing reply stops (never resent)');
    t(/wanted\.has\(last\.o1\) \|\| wanted\.has\(last\.o2\)/.test(fn) && /tries >= max/.test(fn), 'D5 stops at a wanted bonus or the owner\'s max stones');
    t(/if \(l\.augment && l\.augment\.stone && !l\.augDone\)/.test(run), 'D6 the upgrade line augments once (a resumed job does not augment again)'); }
  // ---- MAKEX + PRESET (static) ----
  t(/if \(J\.make && num\(J\.make\.id\)\) \{ trip = await makeRun\(J, id, seq\); return; \}/.test(SW) && /await craftMakeOrder\(num\(M\.recipe\), left, M\.use \|\| \{\}\)/.test(SW), 'E1 a make job buys or crafts (the crafting order), then enchants');
  t(/const pieces = alive\.slice\(\)\.sort\(\(a, b\) => enchLevelOf\(b\) - enchLevelOf\(a\)\)/.test(SW), 'E2 hand-outs give the best enchanted first, one each');
  if (cheap.length >= 1 && rich.length >= 1) {
    const sent0 = sent.length; const mp = await U.makePlan(ctx, { name: rich[0].name, item: { id: cheap[0].id, src: 'shop', offer: cheap[0].offer }, count: 3, enchantTo: 0, give: [rich[0].name, 'Nobody1'] });
    t(mp.count === 3 && mp.give.length === 1 && mp.give[0] === 'Nobody1' && sent.length === sent0, 'E3 make plan: never gives to the maker itself; nothing sent', mp);
    const pr = U.preset(ctx, rich.map(c => c.name).join(','), 'C');
    t(pr.ok && pr.chars.length === rich.length && pr.chars.every(c => c.error || Array.isArray(c.lines)), 'E4 preset answers per character', pr);
    const lines = [].concat(...pr.chars.map(c => c.lines || [])), clanUse = {};
    lines.filter(l => l.src === 'clan').forEach(l => { clanUse[l.id] = (clanUse[l.id] || 0) + 1; });
    const cs = JSON.parse(fs.readFileSync(path.join(LOGS, 'clan_state.json'), 'utf8') || '{}'), clanHave = {};
    ((cs.warehouse && cs.warehouse.items) || []).forEach(r => { clanHave[r.id] = (clanHave[r.id] || 0) + (Number(r.count) || 1); });
    t(Object.keys(clanUse).every(id => clanUse[id] <= (clanHave[id] || 0)), 'E5 a clan warehouse piece is planned for one character only', clanUse);
  }
  // ---- PAPERDOLL-2026-10-25: the character's slots + every candidate for one slot ----
  if (rich.length) {
    const D = await U.doll(ctx, rich[0].name);
    t(D.ok && D.slots.length === 12 && D.slots.filter(s => s.slot === 'ring').length === 2 && D.slots.filter(s => s.slot === 'earring').length === 2, 'F1 the doll has 12 slots (2 earrings, 2 rings)', D.slots && D.slots.map(s => s.label));
    const C = await U.slotCands(ctx, rich[0].name, 'chest');
    t(C.ok && C.items.every(i => i.sources.length > 0) && C.items.every(i => ['chest', 'fullarmor'].includes(A.facts(ctx, i.id).slot)), 'F2 chest candidates: only chest pieces, each with a source', C.items && C.items.slice(0, 3));
    const order = C.items.map(i => i.typeOk ? 1 : 0); t(order.every((v, k) => k === 0 || v <= order[k - 1]), 'F3 the class\'s armor type first');
    const dupe = C.items.some(i => { const k = i.sources.map(s => `${s.src}|${s.char || ''}|${s.enchant || 0}|${s.npc || ''}|${s.crafter || ''}`); return new Set(k).size !== k.length; });
    t(!dupe, 'F4 identical sources are merged (with a count)');
    const bad = await U.slotCands(ctx, rich[0].name, 'tail'); t(bad.code === 400, 'F5 an unknown slot is refused');
    // RECOMMEND-2026-10-25: per slot only pieces that beat what is worn and fit level + type; buy / craft only when better than what we have
    const R = await U.recommend(ctx, rich[0].name);
    t(R.ok && Array.isArray(R.slots) && R.slots.every(s => (s.have || s.buy || s.craft) && [s.have, s.buy, s.craft].filter(Boolean).every(x => x.gain > 0)), 'H1 recommendations only beat what is worn', R.slots && R.slots.slice(0, 3));
    t(R.slots.every(s => !s.buy || (s.buy.src.src === 'shop' && s.buy.cost > 0)) && R.slots.every(s => !s.craft || (s.craft.src.src === 'craft' && s.craft.src.can)), 'H2 buy = a Giran shop with its price; craft only with the materials there');
    t(R.slots.every(s => !s.have || !s.buy || s.buy.stat > s.have.stat), 'H3 buying is only suggested when it beats what we have');
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e.stack); process.exit(1); });
