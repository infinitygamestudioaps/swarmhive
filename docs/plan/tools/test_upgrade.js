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
  t(/if \(l\.unseal && num\(l\.unseal\.id\) && !l\.unsealed\)/.test(run) && run.indexOf('!l.unsealed)') < run.indexOf('equipPiece(objId'), 'A12 GEARUPCOL "unseal first": Pushkin before the piece goes on, once (resume keeps the unsealed piece)');
  t(/enchLevelOf\(replaced\[k\]\.objId\) >= 10\) replaced\.splice/.test(run) && /giveBack: !!b\.giveBack && !!col/.test(API), 'A13 the replaced pieces go back only on the owner\'s tick, never a +10');
  t(/const trip = await ijToGiran\(seq, '!itemjob', \{ solo: !!J\.solo \}\);/.test(run) && (run.match(/ijToGiran\(/g) || []).length === 1, 'A2 ONE Giran trip for all lines');
  t(/if \(l\.result === 'done'\) \{ res\.push/.test(run) && /l\.result = 'done'; l\.worn = !!on; ijSaveJob\(J\);/.test(run), 'A3 every line result is saved; a resumed job skips finished lines');
  t(/const fail = \(why\) => \{ l\.result = 'failed';[^\n]*going on with the next piece/.test(run), 'A4 one failed line does not stop the others');
  t(/worn0\.has\(o\) && !nowWorn\.has\(o\) && !keep\.has\(o\)/.test(run), 'A5 only pieces worn before, taken off by the new ones (and not a new piece) go to the collector');
  t(/const UPGRADE_GIVE_REPLACED = false;/.test(SW) && /col !== me && \(UPGRADE_GIVE_REPLACED \|\| U\.giveBack === true\)/.test(run), 'A6 KEEPOLD (owner 2026-10-26): the replaced pieces stay in my bag (no hand-over, no sale)');
  t(/it\.src === 'char'\) objId = ijFind\(it\.id, null, keep\)/.test(run) && /const nd = l\.unsealed \? \{ ok: true \} : await ijNeeds\(l\.needs, id\)/.test(run), 'A7 another character\'s piece arrives through the needs step (CHARSRC hand-over) first');
  t(/num\(it\.enchant\) > WH_SAFE_ENCH && !J\.overSafeOk/.test(run) && /ijEnchant\(objId, num\(l\.enchant\.to\), num\(l\.enchant\.scroll\), id, it\.name, !!J\.overSafeOk\)/.test(run), 'A8 the safe +4 rule holds (warehouse pieces and enchanting)');
  t(/if \(e\.gone\) \{ fail\(e\.why\); continue; \}/.test(run), 'A9 a destroyed item ends only that line');
  // ---- page + API wiring ----
  t(/\/api\/upgrade\/plan/.test(PAGE) && /\/api\/upgrade\/start/.test(PAGE) && /uiConfirm/.test(PAGE) && !/\bconfirm\(|alert\(|prompt\(/.test(PAGE.replace(/uiConfirm\(/g, '')), 'B1 the page plans, asks with the shared dialog, never a browser confirm');
  t(/the replaced pieces stay in this character's bag/.test(PAGE), 'B2 the page says the replaced pieces stay in the bag');
  t(/data-ucoladd/.test(PAGE) && /\/api\/upgrade\/collector/.test(PAGE) && /id="upBack"/.test(PAGE) && /giveBack: !!S\.giveBack/.test(PAGE) && /unseal: L\.unseal \? \(L\.unsealId \? \{ id: Number\(L\.unsealId\) \}/.test(PAGE), 'B4 GEARUPCOL From the collector: tick, receiver, unseal first, give back');
  t(/UpgradePage\.partyButton\(leader\)/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8')) && /#\/upgrade\/party:/.test(PAGE) && !/presetFill\('party'\)[^\n]*\/api\/upgrade\/start/.test(PAGE), 'B5 the party card opens #/upgrade/party:<leader>; it only fills the draft');
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
    const chl = lines.filter(l => l.src === 'char'); t(new Set(chl.map(l => l.char + ':' + l.objId)).size === chl.length && chl.every(l => (l.enchant || 0) < 10), 'E6 PARTYSPARE a teammate\'s spare piece is planned once, never +10');
  }
  // ---- PAPERDOLL-2026-10-25: the character's slots + every candidate for one slot ----
  if (rich.length) {
    const s0 = sent.length, CS = U.collectorStock(ctx, rich.map(c => c.name).join(',')), cr = (CS.rows || []).filter(r => r.src === 'char');
    t(CS.ok && CS.rows.every(r => r.enchant < 10 && r.gains.every(g => g.gain > 0) && (!r.to || r.to === r.gains[0].name || r.gains.some(g => g.name === r.to))) && sent.length === s0, 'I1 GEARUPCOL collector stock: never +10, every receiver gains, nothing sent', CS.rows && CS.rows.slice(0, 3));
    t(new Set(cr.map(r => r.objId)).size === cr.length && !CS.rows.some(r => r.to === CS.collector), 'I2 each collector piece once; the collector never gets its own piece');
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
    t(R.ok && Array.isArray(R.slots) && R.slots.every(s => (s.have || s.buy || s.craft) && [s.have, s.buy, s.craft].filter(Boolean).every(x => x.gain > 0 || x.set)), 'H1 recommendations only beat what is worn (SETFIX: a set piece is judged with its whole set)', R.slots && R.slots.slice(0, 3));
    t(R.slots.every(s => !s.buy || (s.buy.src.src === 'shop' && s.buy.cost > 0)) && R.slots.every(s => !s.craft || (s.craft.src.src === 'craft' && s.craft.src.can)), 'H2 buy = a Giran shop with its price; craft only with the materials there');
    t(R.slots.every(s => !s.have || !s.buy || s.buy.stat > s.have.stat), 'H3 buying is only suggested when it beats what we have');
    // SETFIX-2026-10-29 (owner: "you recommend different items, that means you don't get any set bonus at all" / "still a 2h sword to a tank")
    const ARM = /^(chest|legs|head|gloves|feet)$/;
    for (const c of rich.slice(0, 6)) {
      const R2 = await U.recommend(ctx, c.name), arm = R2.slots.filter(s => ARM.test(s.slot)), sets = new Set(arm.map(s => s.set));
      t(R2.armorSet && arm.every(s => s.set) && sets.size <= 1 && (!arm.length || R2.armorSet.mode === 'pick'), `L1 ${c.name}: armor only as ONE whole set (${R2.armorSet && R2.armorSet.mode} ${R2.armorSet && R2.armorSet.set ? R2.armorSet.set.name : ''})`, arm.map(s => s.slot + ':' + s.set));
      const wp = R2.slots.find(s => s.slot === 'weapon'), CI = await A.charInfo(ctx, c.name, false);
      const shield = (CI.bag || []).some(r => r.eq && r.slot === 'shield'), two = [wp && wp.have, wp && wp.buy, wp && wp.craft].filter(Boolean).some(x => A.facts(ctx, x.id).two);
      t(!(shield && two), `L2 ${c.name}: no two-handed weapon next to a shield`);
    }
    t(/SETFIX[^\n]*\n[^\n]*const ce = all\.find[^\n]*kit = charKit\(/.test(API) && /!gearWhy\(m\.kit, /.test(API), 'L3 the collector list checks each member\'s kit (no 2h next to a shield / tank, the class weapon line)');
    t(/const loader = \(t, id, at\)/.test(PAGE) && /class="u-spin"/.test(PAGE) && /if \(R\.loading\) return loader\(/.test(PAGE) && /S\.rec\.loading\)\) return '';   \/\/ LOADER/.test(PAGE), 'L5 LOADER: a spinner while loading; the collector box waits for the recommendations');
    t(/function setHtml\(R\)/.test(PAGE) && /data-uset/.test(PAGE) && /No single armor pieces are suggested/.test(PAGE), 'L4 page: the Armor set box, another set to choose, no single pieces when no set can be completed');
  }
  // ---- GEARUPCOL-2-2026-10-29 (owner: "gloves, boots that get unsealed can both be light, heavy OR robe — you just list everything is robe?"): variants per receiver ----
  { const U2 = require(path.join(ROOT, 'Dashboard', 'upgrade_api.js')), os = require('os'), T = fs.mkdtempSync(path.join(os.tmpdir(), 'gearupcol2_'));
    try {
      ['Scripts/data', 'Logs'].forEach(d => fs.mkdirSync(path.join(T, d), { recursive: true }));
      fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', 'unseal_h5.json'), path.join(T, 'Scripts', 'data', 'unseal_h5.json'));
      const names = ['ColX', 'HeavyGuy', 'RobeGuy', 'LightGuy'], at = new Date().toISOString(), W = (f, o) => fs.writeFileSync(path.join(T, f), JSON.stringify(o));
      W('swarm.config.json', { accounts: names.map(n => ({ character: n, party: 'HeavyGuy' })) });
      W('Scripts/data/stash_rules.json', { collector: { on: true, name: 'ColX' } });
      const it = (id, objId, eq) => ({ id, objId, count: 1, eq: !!eq, q: false });
      W('Logs/bag_ColX.json', { at, name: 'ColX', items: [it(5290, 1), it(5767, 2), it(388, 3)] });   // Sealed DC Gloves, DC Gloves - Robe, DC Gaiters (heavy legs)
      W('Logs/bag_HeavyGuy.json', { at, name: 'HeavyGuy', items: [it(365, 11, 1), it(49, 12, 1)] });   // DC Breastplate (no legs) + Gloves
      W('Logs/bag_RobeGuy.json', { at, name: 'RobeGuy', items: [it(2407, 21, 1), it(49, 22, 1)] });   // DC Robe (full body) + Gloves
      W('Logs/bag_LightGuy.json', { at, name: 'LightGuy', items: [it(2385, 31, 1), it(2454, 32, 1)] });   // DC Leather Armor + Karmian Gloves
      const c2 = { DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(T, 'Scripts', 'data'), LOGS: path.join(T, 'Logs'), ROOT: T, readStates: () => names.map(n => ({ name: n, level: 70 })) };
      const O = U2.unsealOptions(c2, 5290);
      t(O.length === 3 && O.map(o => o.kind).join() === 'heavy,light,robe' && new Set(O.map(o => o.entry)).size === 3, 'J1 5290 Sealed Dark Crystal Gloves has 3 unseal targets (heavy / light / robe, own multisell entries)', O);
      t(U2.unsealRow(c2, 5290, 'heavy').id === 5765 && U2.unsealRow(c2, 5290, 5766).id === 5766 && U2.unsealRow(c2, 5290, 5293) === null && U2.unsealRow(c2, 5290).id === 5767, 'J2 unsealRow: wanted kind / variant id (validated) / one-target default');
      const CS = U2.collectorStock(c2, 'HeavyGuy,RobeGuy,LightGuy'), sg = CS.rows.find(r => r.id === 5290), rb = CS.rows.find(r => r.id === 5767), gt = CS.rows.find(r => r.id === 388);
      const gH = sg && sg.gains.find(g => g.name === 'HeavyGuy'), gR = sg && sg.gains.find(g => g.name === 'RobeGuy'), gL = sg && sg.gains.find(g => g.name === 'LightGuy');
      t(gH && gH.unseal.id === 5765 && /Heavy/.test(gH.newName) && gR && gR.unseal.id === 5767 && /Robe/.test(gR.newName) && gL && gL.unseal.id === 5766, 'J3 the sealed gloves: Heavy variant for the heavy wearer, Robe for the robe, Light for the light one', sg && sg.gains);
      t(gH && gH.worn && gH.worn.name === 'Gloves' && gH.worn.stat === 13 && gH.newStat === 46 && gH.gain === 33 && sg.statName === 'P.Def' && /sealed/.test(sg.sealedNote), 'J4 a row carries worn name + stat, the new piece name + stat, the gain, the sealed note', gH);
      t(sg && sg.unseal && sg.unseal.id === (sg.gains.find(g => g.name === sg.to) || {}).unseal.id && !('un' in sg) && !sg.pick, 'J5 the row unseal = the chosen receiver\'s variant; unseal is never on by default (the page starts it OFF)', sg);
      t(rb && rb.gains[0].name === 'RobeGuy' && rb.gains[0].match && rb.gains.filter(g => !g.match).every(g => g.name !== 'RobeGuy'), 'J6 a stocked "- Robe" piece ranks the robe wearer first; other kinds only after it, flagged', rb && rb.gains);
      t(gt && gt.gains.every(g => g.name === 'HeavyGuy'), 'J7 heavy legs never go to a robe / light wearer (nor next to a full-body robe)', gt && gt.gains);
    } finally { try { fs.rmSync(T, { recursive: true, force: true }); } catch (e) { } }
    t(/data-ucolto[^\n]*replaces /.test(PAGE) && /unseal first → \$\{h\(u\.name\)\}/.test(PAGE) && /ucolto[^\n]*render\(\)/.test(PAGE) && /\/api\/upgrade\/collector[^\n]*r\.pick = false; r\.un = false/.test(PAGE), 'J8 page: receiver options "+gain (replaces …)", unseal label = the receiver\'s variant, receiver change re-renders, unseal OFF by default');
    t(/class="u-c1"><input type="checkbox" data-ucolt/.test(PAGE) && /class="u-c4"><input type="checkbox" data-ucolun/.test(PAGE) && /unsealId: un \? u\.id/.test(PAGE), 'J9 page: tick + unseal tick inside clickable labels (no orphan checkbox); the line carries the variant id');
    t(/unsealRow\(ctx, Number\(\(L\.item \|\| \{\}\)\.id\), uw \|\| undefined\)/.test(API) && /that unseal choice does not fit this piece/.test(API), 'J10 plan/start use the variant the page sent, checked against unsealOptions');
    t(/ijBuyAt\(\{ npc: 'Pushkin'[^\n]*num\(l\.unseal\.id\)/.test(SW) && /x\.products\.some\(p => p\.id === num\(id\)\)/.test(SW), 'J11 the bot picks Pushkin\'s multisell entry by the variant\'s item id');
  }
  // ---- RECFIX-2026-10-29 (owner: "The recommended upgrades are complete insane"): a Tank1-like fixture (Shillien Knight 33, shield, heavy, lvl 75) ----
  { const U3 = require(path.join(ROOT, 'Dashboard', 'upgrade_api.js')), os = require('os'), T = fs.mkdtempSync(path.join(os.tmpdir(), 'recfix_'));
    try {
      ['Scripts/data/gear_rec', 'Logs'].forEach(d => fs.mkdirSync(path.join(T, d), { recursive: true }));
      ['unseal_h5.json', 'gear_doctrine.json', path.join('gear_rec', '33.json')].forEach(f => fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', f), path.join(T, 'Scripts', 'data', f)));
      const W = (f, o) => fs.writeFileSync(path.join(T, f), JSON.stringify(o)), at = new Date().toISOString(), it = (id, objId, eq) => ({ id, objId, count: 1, eq: !!eq, q: false });
      W('swarm.config.json', { accounts: [{ character: 'ShadeFix', party: 'ShadeFix' }] });
      // worn: Sirra's Blade, DC Shield, DC Helmet, Doom Plate Armor (full), Doom Gloves / Boots - Heavy; bag: Dragon Slayer + Sword of Ipos (2h), Sealed Tallum Plate,
      // Sealed DC Gloves (3 variants), Sealed Gauntlets of Nightmare, DC Gloves - Robe, Drake Leather Gloves, DC Leather Armor (light chest), Sealed Boots of Nightmare
      W('Logs/bag_ShadeFix.json', { at, name: 'ShadeFix', items: [it(8678, 1, 1), it(641, 2, 1), it(512, 3, 1), it(2381, 4, 1), it(5722, 5, 1), it(5738, 6, 1),
        it(81, 11), it(8679, 12), it(5293, 13), it(5290, 14), it(5313, 15), it(5767, 16), it(2461, 17), it(2385, 18), it(5314, 19)] });
      W('Logs/bag_ShadeLow.json', { at, name: 'ShadeLow', items: [it(8678, 1, 1), it(512, 3, 1), it(2381, 4, 1), it(5722, 5, 1), it(5738, 6, 1)] });
      const c3 = { DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(T, 'Scripts', 'data'), LOGS: path.join(T, 'Logs'), ROOT: T, readJson: ctx.readJson,
        readStates: () => [{ name: 'ShadeFix', level: 75, classId: 33, cls: 'Shillien Knight', ageSec: 999 }] };
      const cand = {}; for (const s of ['weapon', 'head', 'chest', 'gloves', 'feet']) cand[s] = await U3.slotCands(c3, 'ShadeFix', s);
      const ok2h = (cand.weapon.items || []).filter(i => i.typeOk && [81, 8679].includes(i.id));
      t(cand.weapon.ok && cand.weapon.shield && !ok2h.length && cand.weapon.items.filter(i => [81, 8679].includes(i.id)).every(i => /two-handed/.test(i.why)), 'K1 a shield user gets no 2h weapon candidate (Dragon Slayer / Sword of Ipos: "two-handed")', cand.weapon.items && cand.weapon.items.map(i => [i.name, i.typeOk, i.why]));
      t(U3.levelGrade(75) === 'A' && U3.levelGrade(76) === 'S' && U3.levelGrade(61) === 'A' && U3.levelGrade(60) === 'B', 'K2 level grade: 61-75 A, 76+ S, 60 B');
      const GR = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'], plans = ['weapon', 'head', 'chest', 'gloves', 'feet'].map(s => [s, cand[s].plan, cand[s].worn[0]]);
      t(plans.every(([, P, w]) => P && (P.same || GR.indexOf(P.grade) >= GR.indexOf(w.grade))) && cand.weapon.plan.same && cand.head.plan.same && cand.chest.plan.grade === 'A' && cand.gloves.plan.grade === 'A', 'K3 planned = the A plan (lvl 75), never below the worn grade; Sirra / DC Helmet = "as good"', plans);
      const gl = cand.gloves.items, ft = cand.feet.items, sdc = gl.find(i => i.id === 5290), snm = gl.find(i => i.id === 5313), sbn = ft.find(i => i.id === 5314);
      t(gl.filter(i => i.typeOk).every(i => !/- (Light Armor|Robe)/.test(i.newName)) && !gl.find(i => i.id === 5767).typeOk && ft.filter(i => i.typeOk).every(i => !/- (Light Armor|Robe)/.test(i.newName)), 'K4 gloves / boots candidates: heavy (or kindless) only, a "- Robe" piece is "other type"', gl.map(i => [i.name, i.newName, i.typeOk]));
      t(sdc && sdc.unseal && /Heavy/.test(sdc.unseal.name) && /Heavy/.test(sdc.newName) && /unseal → .*Heavy/.test(sdc.sealedNote) && snm && /Heavy/.test(snm.unseal.name) && sbn && /Heavy/.test(sbn.unseal.name), 'K5 sealed pieces with variants unseal to the HEAVY one, said in the note', [sdc, snm, sbn].map(i => i && [i.unseal, i.sealedNote]));
      t(sdc && sdc.replaces && sdc.replaces.name === 'Doom Gloves - Heavy Armor' && sdc.replaces.stat === 44 && sdc.gain === sdc.stat - 44 && sdc.statName === 'P.Def', 'K6 a candidate says what it replaces (name + stat) and gains on the variant', sdc);
      t(!cand.chest.items.find(i => i.id === 2385).typeOk, 'K7 a light chest is not offered to a heavy wearer');
      const R3 = await U3.recommend(c3, 'ShadeFix'), all = [].concat(...R3.slots.map(s => [s.have, s.buy, s.craft].filter(Boolean)));
      t(R3.ok && all.every(x => x.gain > 0 && x.replaces && x.newName) && !all.some(x => [81, 8679, 5767, 2385].includes(x.id)) && R3.slots.every(s => s.plan && (s.plan.same || GR.indexOf(s.plan.grade) >= GR.indexOf(s.worn.grade))), 'K8 recommend: gain > 0 with "replaces", no 2h / robe / light piece, plan >= worn grade', R3.slots.map(s => [s.slot, s.plan, s.have && s.have.name]));
      W('swarm.config.json', { accounts: [{ character: 'ShadeLow', party: 'ShadeLow' }] });
      const P4 = U3.preset(Object.assign({}, c3, { readStates: () => [{ name: 'ShadeLow', level: 75, classId: 33 }] }), 'ShadeLow', 'C'), P5 = U3.preset(Object.assign({}, c3, { readStates: () => [{ name: 'ShadeLow', level: 75, classId: 33 }] }), 'ShadeLow', 'auto');
      const l4 = (P4.chars[0] || {}).lines || [], l5 = (P5.chars[0] || {}).lines || [];
      t(P4.ok && !(P4.chars[0] || {}).error && !l4.some(l => /^(weapon|head|chest|legs|gloves|feet)$/.test(l.slot)) && (P5.chars[0] || {}).grade === 'A' && !l5.some(l => GR.indexOf(l.grade) < GR.indexOf('A') && /^(weapon|head|chest|legs|gloves|feet)$/.test(l.slot)), 'K9 preset: a C fill never replaces B/A gear; "auto" = the level grade (A at 75)', { c: l4.map(l => l.name), auto: l5.map(l => l.name), notes: P5.chars[0] });
    } finally { try { fs.rmSync(T, { recursive: true, force: true }); } catch (e) { } }
    t(/planned: what you wear is as good/.test(PAGE) && /replaces ' \+ h\(x\.replaces\.name\)/.test(PAGE) && /unsealId: o\.unseal\.id/.test(PAGE) && /\['auto', 'D', 'C', 'B', 'A', 'S'\]/.test(PAGE), 'K10 page: "as good" / "replaces … →" text, a sealed Add carries the variant, grade default = their level');
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e.stack); process.exit(1); });
