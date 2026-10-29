// UPGRADE ORDERS (UPGRADE-2026-10-25; owner: "select a character then ask it to go get upgrades in town ... from where ever we have one,
// warehouse, clan warehouse, other character ... select SA ... MORE than just a weapon upgrade, like go to town and get these armor pieces and
// equip them, then give your other spare items to the collector ... we have an entire raid waiting to get upgrades ... easily from my phone").
// Owner choices 2026-10-25: only the pieces the new ones REPLACE go to the collector; another character hands an item over only when the owner
// picked it from that character; above +4 asks first (overSafeOk).
//   /upgradepage.js                    public page script (#/upgrade)
//   POST /api/upgrade/plan  { orders: [{ name, lines: [{ item: { src: bag|wh|clan|char|shop, id, objId, enchant, char, offer }, enchantTo,
//                             blessed, saId, wear }] }], use: { wh, clan, buy }, overSafeOk }  -> every line planned (itemspage_api.plan)
//   POST /api/upgrade/start (same body)  -> one item job per character (Logs/itemjobs/<id>.json, kind upgrade) + "!itemjob <id>"
//   GET  /api/upgrade/status?ids=a,b   -> each job's live status (state, step, result)
// Materials (scrolls, soul crystals, gemstones): the owner ticks once per order where they may come from (use.wh / use.clan / use.buy); the
// character's own bag always counts. Nothing else is taken or bought (the Items page "ask first" rule).
'use strict';
const fs = require('fs'), path = require('path');
const IP = require('./itemspage_api'), IL = require('./itemslogic');
const NAME_RE = /^[A-Za-z0-9]{2,16}$/;
const isoNow = () => new Date().toISOString();
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const MAX_CHARS = 30, MAX_LINES = 14;

function collectorName(ctx) {
  const c = (rj(path.join(ctx.DATA, 'stash_rules.json'), {}) || {}).collector || null;
  if (!c || c.on !== true) return '';
  return String(c.name || IP.clanLeader(ctx) || '');
}
function lineBody(name, L) {
  const it = L.item || {};
  return { name, item: { src: String(it.src || 'bag'), id: Number(it.id) || 0, objId: Number(it.objId) || 0, enchant: Number(it.enchant) || 0, char: String(it.char || ''), offer: it.offer || null },
    enchantTo: Number(L.enchantTo) || 0, blessed: !!L.blessed, saId: Number(L.saId) || 0, giveTo: name,
    augment: L.augment && Number(L.augment.stone) ? { stone: Number(L.augment.stone), wanted: (L.augment.wanted || []).map(Number), max: Number(L.augment.max) || 1 } : null };
}
/** plan one line; the materials' sources from the order's ticks: bag (always) -> warehouse -> clan warehouse -> buy */
async function planLine(ctx, name, L, use, overSafeOk) {
  const b = Object.assign(lineBody(name, L), { overSafeOk: !!overSafeOk });
  let p = await IP.plan(ctx, b); if (p.error) return p;
  const pick = {};
  for (const n of p.needs || []) {
    if (!n.ask || !(n.missing > 0)) continue;
    const o = n.options || {}, rest = n.missing;
    if (use.wh && Number(o.wh) >= rest) pick[n.id] = 'wh';
    else if (use.clan && Number(o.clan) >= rest) pick[n.id] = 'clan';
    else if (use.wh && Number(o.wh) > 0 && !use.clan && !use.buy) pick[n.id] = 'wh';
    else if (use.clan && Number(o.clan) > 0 && !use.buy) pick[n.id] = 'clan';
    else if (use.buy && o.buy) pick[n.id] = 'buy';
  }
  if (Object.keys(pick).length) p = await IP.plan(ctx, Object.assign(b, { sources: pick }));
  return p;
}
async function planAll(ctx, b) {
  const orders = Array.isArray(b.orders) ? b.orders : [];
  if (!orders.length) return { code: 400, error: 'Pick at least one character and one item.' };
  if (orders.length > MAX_CHARS) return { code: 400, error: `At most ${MAX_CHARS} characters in one order.` };
  const use = { wh: !!(b.use && b.use.wh), clan: !!(b.use && b.use.clan), buy: !!(b.use && b.use.buy) };
  const out = [], seen = new Set();
  for (const o of orders) {
    const name = String(o.name || ''); if (!NAME_RE.test(name) || seen.has(name)) continue; seen.add(name);
    const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, MAX_LINES);
    const res = [];
    for (const L of lines) {
      const p = await planLine(ctx, name, L, use, b.overSafeOk);
      const us = L.unseal && !p.error ? unsealRow(ctx, Number((L.item || {}).id)) : null;   // GEARUPCOL-2026-10-29: the owner ticked "unseal first" -> Pushkin before it goes on
      if (us) { const wi = p.steps.findIndex(s => /puts it on/.test(s.text || '')); p.steps.splice(wi >= 0 ? wi : p.steps.length, 0, { k: 'unseal', text: `unseal it at Pushkin (${IL.kmb(us.aa)} ${us.pay === 57 ? 'adena' : 'Ancient Adena'})` }); if (us.pay === 57) p.adena = (Number(p.adena) || 0) + us.aa; else (p.warn = p.warn || []).push(`needs ${IL.kmb(us.aa)} Ancient Adena in ${name}'s bag for the S-grade seal`); }
      res.push(p.error ? { error: p.error, item: L.item } : { unseal: us, ok: p.ok, item: p.item, steps: p.steps.map(s => s.text), missing: p.missing.map(m => `${m.missing}× ${m.what}`), needs: p.needs,
        adena: p.adena, warn: p.warn, overSafe: p.overSafe, saOptions: (p.saOptions || []).map(s => ({ saId: s.saId, sa: s.sa, color: s.color, stage: s.stage })), enchantTo: p.enchantTo, saId: p.saId, chance: p.chance, finalId: p.finalId, offer: p.offer, augment: p.augment || null });
    }
    const C = await IP.charInfo(ctx, name, false);
    const adena = res.reduce((t, r) => t + (Number(r.adena) || 0), 0);
    out.push({ name, level: C.level || null, haveAdena: C.adena || 0, adena, lines: res, ok: res.length > 0 && res.every(r => r.ok) && adena <= (C.adena || 0) + 1,
      why: !res.length ? 'no items' : res.some(r => r.error) ? 'a line has an error' : res.some(r => r.missing && r.missing.length) ? 'something is missing' : adena > (C.adena || 0) + 1 ? `needs about ${IL.kmb(adena)} adena, has ${IL.kmb(C.adena || 0)}` : res.some(r => r.overSafe && r.overSafe.length) && !b.overSafeOk ? 'above +4: tick the warning' : '' });
  }
  return { ok: out.length > 0 && out.every(o => o.ok), use, collector: collectorName(ctx), orders: out };
}
// UPGQUEUE-2026-10-25 (owner: "it should NOT go back and do it right away, it should wait until next time they reach town OR if you click
// overwrite you can either send 1 person OR the entire team to town to upgrade"): b.when = 'town' (default: the job waits in Logs/itemjobs with
// queued{}; the dispatcher below sends it the next time the character stands in Giran, its party is held there by the normal item-job hold)
// | 'party' (now: the party goes to Giran together, as before) | 'solo' (now: only this character goes, away like a scout, then rejoins its party;
// a party leader always takes the party)
const GIRAN_BOX = [75900, 85100, 144800, 152400];   // Giran's recorded streets (Scripts/data/giran_routes.json 77458-83473 / 146400-150788) + margin
const inGiran = (c) => { const x = Number(c && c.x), y = Number(c && c.y); return x >= GIRAN_BOX[0] && x <= GIRAN_BOX[1] && y >= GIRAN_BOX[2] && y <= GIRAN_BOX[3]; };
function jobDir(ctx) { const d = path.join(ctx.LOGS, 'itemjobs'); fs.mkdirSync(d, { recursive: true }); return d; }
function writeStatus(ctx, id, o, line) {
  const f = path.join(jobDir(ctx), id + '_status.json'), st = rj(f, null) || { steps: [] };
  Object.assign(st, o, { at: isoNow() }); if (line) { st.step = line; (st.steps = st.steps || []).push({ at: isoNow(), text: line }); }
  fs.writeFileSync(f, JSON.stringify(st, null, 1));
}
async function sendJob(ctx, J, why) {
  const lines = (J.upgrade && J.upgrade.lines) || [], cl = J.clanLeader;
  const usesClan = lines.some(l => l.item.src === 'clan' || (l.needs || []).some(n => n.from && Number(n.from.clan) > 0)) || ((J.unseal && J.unseal.pieces) || []).some(p => p.src === 'clan');   // KITGET / UNSEALPICK
  const r = await ctx.commandRun({ cmd: '!itemjob ' + J.id, targets: ['chars:' + [J.doer].concat(usesClan && cl && cl !== J.doer ? [cl] : []).join(',')] });
  const body = r && r.body ? r.body : r;
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), isoNow() + '\tupgrade\t' + J.id + ' (' + why + '): ' + lines.map(l => l.item.name + (l.enchant ? ' +' + l.enchant.to : '') + (l.sa ? ' SA' : '')).join(', ').slice(0, 400) + '\t' + J.by + '\r\n'); } catch (e) { }
  return body && body.error ? body.error : null;
}
function isLeaderName(ctx, name) { try { const c = ctx.readStates().find(x => x.name === name); return !!(c && (c.leader || String(c.party || '') === name)); } catch (e) { return false; } }
async function start(ctx, b) {
  if (!ctx.commandRun) return { code: 500, error: 'the dashboard server needs a restart' };
  const when = /^(town|party|solo)$/.test(String(b.when || '')) ? String(b.when) : 'town';
  const P = await planAll(ctx, b); if (P.error) return P;
  const go = P.orders.filter(o => o.ok), skipped = P.orders.filter(o => !o.ok).map(o => ({ name: o.name, why: o.why }));
  if (!go.length) return { code: 409, error: 'Nothing can start: ' + skipped.map(s => `${s.name}: ${s.why}`).join('; '), plan: P };
  const dir = path.join(ctx.LOGS, 'itemjobs'); fs.mkdirSync(dir, { recursive: true });
  const col = P.collector, cl = IP.clanLeader(ctx), started = [];
  for (const o of go) {
    const id = `ij_${o.name.toLowerCase()}_up${Date.now().toString(36)}`;
    const lines = o.lines.map(r => ({
      item: { src: r.item.src, id: r.item.id, objId: r.item.objId, enchant: r.item.enchant, name: r.item.name, kind: r.item.kind, grade: r.item.grade, offer: r.offer || null, char: r.item.char || '' },
      enchant: r.enchantTo > r.item.enchant ? { to: r.enchantTo, scroll: IL.scrollFor(r.item.kind || 'armor', r.item.grade, false) } : null,
      sa: r.saId ? fullSa(ctx, r) : null,
      finalId: r.finalId, wear: true, augment: r.augment || null, unseal: r.unseal || null,
      needs: (r.needs || []).map(n => ({ id: n.id, what: n.what, need: n.need, from: n.from, buy: n.buy || null, choice: n.choice || '' })) }));
    const solo = when === 'solo' && !isLeaderName(ctx, o.name);
    const J = { id, doer: o.name, kind: 'upgrade', upgrade: { lines, collector: col && col !== o.name ? col : '', giveBack: !!b.giveBack && !!col && col !== o.name }, item: { name: `${lines.length} upgrade(s)`, id: 0 }, overSafeOk: !!b.overSafeOk,
      give: null, needs: [], clanLeader: cl, steps: [].concat(...o.lines.map(r => r.steps)), created: isoNow(), by: String(b.by || 'dashboard upgrade').slice(0, 40),
      solo, queued: when === 'town' ? { since: isoNow() } : null };
    fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(J, null, 1));
    if (when === 'town') { writeStatus(ctx, id, { state: 'queued' }, `waits until ${o.name} is in Giran next time (or Send now)`); started.push({ name: o.name, id, queued: true }); continue; }
    started.push({ name: o.name, id, error: await sendJob(ctx, J, solo ? 'alone now' : 'party now'), solo, leaderTakesParty: when === 'solo' && !solo });
  }
  return { ok: true, started, skipped, collector: col, when };
}
// a queued job: send it now (party / solo) or cancel it
async function sendNow(ctx, b) {
  const id = String(b.id || ''); if (!/^ij_[a-z0-9_]+$/i.test(id)) return { code: 400, error: 'id?' };
  const f = path.join(jobDir(ctx), id + '.json'), J = rj(f, null); if (!J) return { code: 404, error: 'no such job' };
  if (!J.queued) return { code: 409, error: 'this job was already sent' };
  if (b.cancel) { J.queued = null; J.cancelled = isoNow(); fs.writeFileSync(f, JSON.stringify(J, null, 1)); writeStatus(ctx, id, { state: 'failed', result: 'cancelled' }, 'cancelled on the dashboard (nothing was done)'); return { ok: true, cancelled: id }; }
  const solo = b.mode === 'solo' && !isLeaderName(ctx, J.doer);
  J.queued = null; J.solo = solo; J.sentAt = isoNow(); fs.writeFileSync(f, JSON.stringify(J, null, 1));
  writeStatus(ctx, id, { state: 'sent' }, solo ? J.doer + ' goes to Giran alone now, then back to the party' : J.doer + "'s party goes to Giran now");
  const err = await sendJob(ctx, J, solo ? 'override: alone' : 'override: party');
  return err ? { code: 500, error: err } : { ok: true, id, solo, leaderTakesParty: b.mode === 'solo' && !solo };
}
// the dispatcher: every 20 s, a queued job whose character stands in Giran (online, alive, not fighting, not in a raid) is sent
let DISP = null;
function dispatchStart(ctx) { if (DISP) return; DISP = setInterval(() => { dispatchTick(ctx).catch(() => { }); }, 20000); }
async function dispatchTick(ctx) {
  const dir = jobDir(ctx); let st = null; const sent = [];
  for (const fn of fs.readdirSync(dir)) {
    if (!/^ij_.*\.json$/.test(fn) || fn.endsWith('_status.json')) continue;
    const J = rj(path.join(dir, fn), null); if (!J || !J.queued) continue;
    st = st || ctx.readStates();
    const c = st.find(x => x.name === J.doer); if (!c) continue;
    if (!(Number(c.ageSec) < 60 && !c.dead && !c.combat && !/raid|mission|kamaloka/i.test(String(c.mode || '')) && inGiran(c))) continue;
    J.queued = null; J.sentAt = isoNow(); fs.writeFileSync(path.join(dir, fn), JSON.stringify(J, null, 1));
    writeStatus(ctx, J.id, { state: 'sent' }, J.doer + ' is in Giran: starting ' + (J.kind === 'kitget' ? 'the Frenzy kit job' : 'the upgrade'));
    await sendJob(ctx, J, 'next town visit'); sent.push(J.id);
  }
  return sent;
}
// every upgrade job of these characters (queued, running, the last 24 h), newest first
function jobsFor(ctx, names) {
  const want = new Set(String(names || '').split(',').filter(Boolean)), dir = jobDir(ctx), out = [];
  fs.readdirSync(dir).forEach(fn => { if (!/^ij_.*_up[a-z0-9]+\.json$/.test(fn)) return; const J = rj(path.join(dir, fn), null); if (!J || J.kind !== 'upgrade' || (want.size && !want.has(J.doer))) return;
    const S2 = rj(path.join(dir, J.id + '_status.json'), null) || {};
    if ((S2.state === 'done' || S2.state === 'failed') && Date.now() - (Date.parse(S2.at || '') || 0) > 24 * 3600000) return;
    out.push({ id: J.id, name: J.doer, queued: !!J.queued, solo: !!J.solo, created: J.created, state: J.queued ? 'queued' : S2.state || 'sent', step: S2.step || '', lines: J.upgrade.lines.map(l => ({ name: l.item.name, enchant: l.enchant ? l.enchant.to : 0, sa: !!l.sa, result: l.result || '' })) }); });
  return { ok: true, jobs: out.sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 30) };
}
// RECOMMEND-2026-10-25 (owner: "Upgrade under /char should show recommended items to upgrade or replace ... every warehouse, clan warehouse or
// inventory ... also what is possible via Giran or trades, but warn about the cost"): per slot the best piece we HAVE (bag / own warehouse / clan
// warehouse / another character's bag = a trade) and the best one to BUY or CRAFT, each only when it beats what is worn and fits level + type
async function recommend(ctx, name) {
  const D = await doll(ctx, name); if (!D || D.error) return D || { code: 500, error: 'no paperdoll' };
  const out = [];
  for (const s of D.slots || []) {
    if (s.blocked || s.idx > 0) continue;   // earrings / rings: one recommendation per kind
    const C = await slotCands(ctx, name, s.slot); if (!C || C.error) continue;
    const good = C.items.filter(i => i.better && i.levelOk && i.typeOk && !i.wornNow);
    const pick = (re) => { for (const i of good) { const src = i.sources.filter(x => re.test(x.src)).sort((a, b) => (a.price || 0) - (b.price || 0))[0]; if (src) return { item: i, src }; } return null; };
    const have = pick(/^(bag|wh|clan|char)$/), buyS = pick(/^shop$/);
    const craftS = (() => { for (const i of good) { const src = i.sources.find(x => x.src === 'craft' && x.can); if (src) return { item: i, src }; } return null; })();   // only crafts with the materials there
    if (!have && !buyS && !craftS) continue;
    const w = C.worn[0], row = (x) => x && { id: x.item.id, name: x.item.name, icon: x.item.icon, grade: x.item.grade, stat: x.item.stat, gain: x.item.stat - (w ? w.stat : 0), recommended: !!x.item.recommended, src: x.src,
      cost: x.src.src === 'shop' ? Math.ceil((x.src.price || 0) * 1.2) : 0, trade: x.src.src === 'char' ? x.src.char : '' };
    const beats = (x) => x && (!have || x.item.stat > have.item.stat);   // buy / craft only when better than what we already have
    out.push({ slot: s.slot, idx: 0, label: s.label, worn: w ? { name: w.name, enchant: w.enchant || 0 } : null, have: row(have), buy: beats(buyS) ? row(buyS) : null, craft: beats(craftS) ? row(craftS) : null });
  }
  const C = await IP.charInfo(ctx, name, false);
  return { ok: true, name, level: D.level || C.level || null, adena: C.adena || 0, slots: out };
}
function fullSa(ctx, r) {
  // the same SA record the single item job stores: the recipe for this weapon + the chosen SA, plus the weapon id
  try { const rec = IL.saOptions(r.item.base || r.item.id, rj(path.join(ctx.DATA, 'soul_sa_recipes.json'), { recipes: [] }).recipes || []).find(x => Number(x.saId) === Number(r.saId)); return rec ? Object.assign({}, rec, { weapon: r.item.id }) : { saId: r.saId, weapon: r.item.id }; } catch (e) { return { saId: r.saId, weapon: r.item.id }; }
}
// MAKEX-2026-10-25 (owner: "ask a toon to buy x amount of homunkulus swords in giran OR craft them and then enchant them afterwards to +x"):
// body { name, item: { id, src: shop|craft, offer, recipe }, count, enchantTo, give: [names], use: { wh, clan }, overSafeOk }
async function makePlan(ctx, b) {
  const name = String(b.name || ''); if (!NAME_RE.test(name)) return { code: 400, error: 'Choose who makes them.' };
  const it = b.item || {}, id = Number(it.id), src = it.src === 'craft' ? 'craft' : 'shop';
  if (!(id > 0)) return { code: 400, error: 'Choose an item.' };
  const count = Math.max(1, Math.min(50, Number(b.count) || 1)), to = Math.max(0, Math.min(25, Number(b.enchantTo) || 0));
  const F = IP.facts(ctx, id), C = await IP.charInfo(ctx, name, false); if (C.error) return C;
  const warn = [], overSafe = [], steps = []; let adena = 0, offer = null, recipe = 0;
  if (src === 'shop') {
    const rows = [].concat(...IP.shops(ctx).shops.map(x => x.rows)), row = (it.offer && rows.find(r => r.id === id && r.offer && r.offer.npc === it.offer.npc)) || rows.find(r => r.id === id && !r.cost);
    if (!row) return { code: 400, error: `${F.name} is not sold for adena by a Giran NPC.` };
    offer = row.offer; adena = Math.ceil(row.price * count * 1.2);
    steps.push(`${name} buys ${count}× ${F.name} at ${row.npc} (about ${IL.kmb(adena)} adena)`);
  } else {
    const ci = await IP.craftInfo(ctx, name); if (ci.error) return ci;
    if (!ci.crafter) return { code: 400, error: ci.why || `${name} cannot craft.` };
    const r = (ci.recipes || []).find(x => Number(x.product) === id && (!it.recipe || Number(x.list) === Number(it.recipe)));
    if (!r) return { code: 400, error: `${name} has no recipe for ${F.name} (or its craft level is too low).` };
    recipe = r.list;
    const short = (r.ing || []).filter(g => (Number((g.have || {}).bag) || 0) + (b.use && b.use.wh ? Number((g.have || {}).wh) || 0 : 0) + (b.use && b.use.clan ? Number((g.have || {}).clan) || 0 : 0) < Number(g.count) * count);
    if (short.length) warn.push(`Materials short for ${count}: ${short.map(g => `${g.name} (need ${Number(g.count) * count})`).join(', ')} — it makes as many as the materials allow.`);
    steps.push(`${name} crafts ${count}× ${F.name} (recipe ${r.name || r.list}${b.use && (b.use.wh || b.use.clan) ? ', materials also from the ' + [b.use.wh ? 'warehouse' : '', b.use.clan ? 'clan warehouse' : ''].filter(Boolean).join(' + ') : ''})`);
  }
  const needs = [];
  if (to > 0) {
    if (F.common) return { code: 400, error: 'Common items cannot be enchanted.' };
    const sc = IL.scrollFor(F.kind || 'armor', F.grade, false), n = count * to;
    const S = { bag: C.bag.map(r => ({ id: r.id, count: r.count, eq: r.eq })), wh: C.wh, clan: C.clan }, h = IL.have(sc, S);
    const from = { bag: Math.min(n, h.bag), wh: 0, clan: 0 }; let rest = n - from.bag;
    if (rest > 0 && b.use && b.use.wh) { from.wh = Math.min(rest, h.wh); rest -= from.wh; }
    if (rest > 0 && b.use && b.use.clan) { from.clan = Math.min(rest, h.clan); rest -= from.clan; }
    const what = `Scroll: Enchant ${F.kind === 'weapon' ? 'Weapon' : 'Armor'} (${IL.gradeKey(F.grade)}-Grade)`;
    needs.push({ id: sc, what, need: n - rest, from });
    if (rest > 0) warn.push(`${rest} of ${n} ${what} are missing (bag ${h.bag}, warehouse ${h.wh}, clan warehouse ${h.clan}) — enchanting stops when they run out.`);
    steps.push(`enchant each to +${to} (${n} scrolls at most; one try per level, a fail stops that piece)`);
    const R = (IP.rates ? IP.rates(ctx) : null) || {}; if (to > (R.safe || 4)) overSafe.push(`Enchanting to +${to} goes above the safe +4: every try above +4 can DESTROY the item.`);
  }
  const give = (Array.isArray(b.give) ? b.give : []).map(String).filter(n => NAME_RE.test(n) && n !== name).slice(0, count);
  steps.push(give.length ? `then one each to ${give.join(', ')} (the best enchanted first)` : `they stay in ${name}'s bag`);
  if (adena > (C.adena || 0)) warn.push(`${name} has ${IL.kmb(C.adena || 0)} adena, this needs about ${IL.kmb(adena)}.`);
  if (adena >= 3000000) overSafe.push(`This costs about ${IL.kmb(adena)} adena.`);
  const ok = adena <= (C.adena || 0) + 1 && (!overSafe.length || !!b.overSafeOk);
  return { ok, name, item: { id, name: F.name, kind: F.kind, grade: F.grade, src }, count, enchantTo: to, offer, recipe, needs, give, adena, haveAdena: C.adena || 0, steps, warn, overSafe };
}
async function makeStart(ctx, b) {
  if (!ctx.commandRun) return { code: 500, error: 'the dashboard server needs a restart' };
  const p = await makePlan(ctx, b); if (p.error) return p;
  if (!p.ok) return { code: 409, error: p.overSafe.length && !b.overSafeOk ? 'Tick the warning first.' : 'Not enough adena.', plan: p };
  const id = `ij_${p.name.toLowerCase()}_mk${Date.now().toString(36)}`;
  const J = { id, doer: p.name, kind: 'make', item: { name: `${p.count}× ${p.item.name}`, id: p.item.id },
    make: { id: p.item.id, name: p.item.name, src: p.item.src, offer: p.offer, recipe: p.recipe, count: p.count, enchantTo: p.enchantTo, scroll: p.enchantTo ? IL.scrollFor(p.item.kind || 'armor', p.item.grade, false) : 0,
      use: { wh: !!(b.use && b.use.wh), clan: !!(b.use && b.use.clan) }, give: p.give },
    needs: p.needs, overSafeOk: !!b.overSafeOk, give: null, clanLeader: IP.clanLeader(ctx), steps: p.steps, created: isoNow(), by: 'dashboard make' };
  const dir = path.join(ctx.LOGS, 'itemjobs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(J, null, 1));
  const cl = J.clanLeader, usesClan = (p.needs || []).some(n => n.from && n.from.clan > 0) || (J.make.use.clan && p.item.src === 'craft');
  const r = await ctx.commandRun({ cmd: `!itemjob ${id}`, targets: ['chars:' + [p.name].concat(usesClan && cl && cl !== p.name ? [cl] : []).join(',')] });
  const body = r && r.body ? r.body : r;
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tmake\t${id}: ${p.steps.join(' / ').slice(0, 400)}\tdashboard\r\n`); } catch (e) { }
  return body && body.error ? { code: 500, error: body.error } : { ok: true, id, name: p.name };
}
// UNSEALPICK-2026-10-25 (owner: "why cant i select items in clan warehouse and unseal them????"): GET /api/upgrade/unseal?name= -> every sealed piece
// in the character's bag / warehouse / the clan warehouse with what it becomes and the price at Pushkin; POST unseal/plan + unseal/start
// { name, items: [{ src, id, enchant, count }] } -> one item job (J.unseal). Nothing is taken or paid without the owner's pick + confirm.
let UNS = null, UNS_AT = 0;
function unsealData(ctx) {
  const f = path.join(ctx.ROOT || path.join(__dirname, '..'), 'Scripts', 'data', 'unseal_h5.json');
  try { const t = fs.statSync(f).mtimeMs; if (!UNS || t !== UNS_AT) { UNS = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); UNS_AT = t; } } catch (e) { UNS = UNS || {}; }
  return UNS;
}
function unsealRow(ctx, sealedId) {
  const r = (unsealData(ctx).bySealed || {})[sealedId]; if (!r) return null;
  const sgrade = r.list === 311262504 || r.list === 311262505, acc = r.list === 311262505 || r.list === 311262507;
  return { id: Number(r.id), pay: Number(r.pay) || (sgrade ? 5575 : 57), aa: Number(r.aa) || 0, label: `Release the ${sgrade ? 'S' : 'A'}-grade ${acc ? 'accessory' : 'armor'} seal` };
}
async function unsealList(ctx, name) {
  if (!NAME_RE.test(String(name || ''))) return { code: 400, error: 'Choose who unseals.' };
  const C = await IP.charInfo(ctx, name, false); if (C.error) return C;
  const out = [], by = {};
  const add = (src, r) => { const u = unsealRow(ctx, Number(r.id)); if (!u) return; const ench = Number(r.enchant) || 0, k = `${src}:${r.id}:${ench}`;
    if (by[k]) { by[k].count += Math.max(1, Number(r.count) || 1); return; }
    const F = IP.facts(ctx, u.id) || {};
    out.push(by[k] = { key: k, src, id: Number(r.id), name: String(r.name || ''), enchant: ench, count: Math.max(1, Number(r.count) || 1), objId: src === 'bag' ? Number(r.objId) || 0 : 0,
      to: { id: u.id, name: F.name || ('item ' + u.id), grade: F.grade || '', kind: F.kind || '' }, pay: u.pay, payName: u.pay === 57 ? 'adena' : 'Ancient Adena', price: u.aa }); };
  (C.bag || []).filter(r => !r.eq).forEach(r => add('bag', r)); (C.wh || []).forEach(r => add('wh', r)); (C.clan || []).forEach(r => add('clan', r));
  const aaHave = (C.bag || []).filter(r => Number(r.id) === 5575).reduce((t, r) => t + (Number(r.count) || 0), 0);
  return { ok: true, name, pieces: out, adena: C.adena || 0, ancient: aaHave, clanLeader: IP.clanLeader(ctx) };
}
async function unsealPlan(ctx, b) {
  const L = await unsealList(ctx, b.name); if (L.error) return L;
  const picks = (Array.isArray(b.items) ? b.items : []).map(x => ({ src: String(x.src || ''), id: Number(x.id) || 0, enchant: Number(x.enchant) || 0, count: Math.max(1, Math.min(50, Number(x.count) || 1)) }));
  if (!picks.length) return { code: 400, error: 'Tap the sealed pieces first.' };
  const pieces = [], warn = [], steps = []; let adena = 0, ancient = 0;
  for (const p of picks) {
    const row = L.pieces.find(r => r.src === p.src && r.id === p.id && r.enchant === p.enchant);
    if (!row) { warn.push(`item ${p.id} is not in the ${p.src === 'clan' ? 'clan warehouse' : p.src === 'wh' ? 'warehouse' : 'bag'} any more`); continue; }
    if (p.src !== 'bag' && row.enchant >= 10 && !b.plus10Ok) { warn.push(`${row.name} +${row.enchant}: +10 and higher only with the +10 tick`); continue; }
    const n = Math.min(p.count, row.count); if (n < p.count) warn.push(`${row.name}: only ${row.count} there`);
    const u = unsealRow(ctx, row.id);
    for (let k = 0; k < n; k++) pieces.push({ src: row.src, id: row.id, name: row.name, enchant: row.enchant, objId: row.src === 'bag' ? row.objId : 0, toId: u.id, toName: row.to.name, label: u.label, pay: u.pay, price: u.aa, plus10: row.src !== 'bag' && row.enchant >= 10 });
    if (u.pay === 57) adena += u.aa * n; else ancient += u.aa * n;
  }
  if (!pieces.length) return { code: 400, error: warn.join('; ') || 'nothing to unseal' };
  const fromWh = pieces.filter(x => x.src !== 'bag');
  if (fromWh.length) steps.push(`${b.name} takes ${fromWh.length} sealed piece(s) out of the ${fromWh.some(x => x.src === 'clan') ? 'clan ' : ''}warehouse (in Giran)`);
  steps.push(`unseals ${pieces.length} piece(s) at Pushkin: ${[...new Set(pieces.map(x => x.toName))].join(', ').slice(0, 200)}`);
  steps.push(`cost: ${adena ? IL.kmb(adena) + ' adena' : ''}${adena && ancient ? ' + ' : ''}${ancient ? IL.kmb(ancient) + ' Ancient Adena' : ''}`);
  if (fromWh.length) steps.push('the unsealed pieces go back into the clan warehouse'); else steps.push(`they stay in ${b.name}'s bag`);
  if (adena > L.adena) warn.push(`not enough adena: needs ${IL.kmb(adena)}, has ${IL.kmb(L.adena)}`);
  if (ancient > L.ancient) warn.push(`not enough Ancient Adena in the bag: needs ${IL.kmb(ancient)}, has ${IL.kmb(L.ancient)}`);
  return { ok: adena <= L.adena && ancient <= L.ancient, name: b.name, pieces, adena, ancient, steps, warn, clanLeader: L.clanLeader };
}
async function unsealStart(ctx, b) {
  if (!ctx.commandRun) return { code: 500, error: 'the dashboard server needs a restart' };
  const p = await unsealPlan(ctx, b); if (p.error) return p;
  if (!p.ok) return { code: 409, error: p.warn.join('; ') || 'not possible', plan: p };
  const id = `ij_${p.name.toLowerCase()}_us${Date.now().toString(36)}`;
  const J = { id, doer: p.name, kind: 'unseal', item: { name: `unseal ${p.pieces.length} piece(s)`, id: p.pieces[0].toId }, unseal: { pieces: p.pieces }, give: null,
    clanLeader: p.clanLeader, steps: p.steps, created: isoNow(), by: 'dashboard unseal' };
  const dir = path.join(ctx.LOGS, 'itemjobs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(J, null, 1));
  const cl = p.clanLeader, usesClan = p.pieces.some(x => x.src === 'clan');
  const r = await ctx.commandRun({ cmd: `!itemjob ${id}`, targets: ['chars:' + [p.name].concat(usesClan && cl && cl !== p.name ? [cl] : []).join(',')] });
  const body = r && r.body ? r.body : r;
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tunseal\t${id}: ${p.steps.join(' / ').slice(0, 400)}\tdashboard\r\n`); } catch (e) { }
  return body && body.error ? { code: 500, error: body.error } : { ok: true, id, name: p.name };
}
// PRESET-2026-10-25 (owner: "an entire raid waiting to get upgrades to top C-grade gear"): GET /api/upgrade/preset?names=a,b&grade=C ->
// per character the gear plan's piece for every slot of that grade (Scripts/data/gear_rec/<classId>.json, Dashboard/gear_recommend.js) that it
// does not wear yet, with a source: its own bag -> the clan warehouse (each piece once) -> a Giran shop; else listed as not available
function preset(ctx, namesRaw, gradeRaw) {
  const grade = ['D', 'C', 'B', 'A', 'S'].includes(String(gradeRaw).toUpperCase()) ? String(gradeRaw).toUpperCase() : 'C';
  const all = (IP.chars(ctx).chars || []), names = String(namesRaw || '').split(',').filter(n => NAME_RE.test(n)).slice(0, MAX_CHARS);
  const shopRows = [].concat(...IP.shops(ctx).shops.map(x => x.rows)).filter(r => !r.cost);
  const cs = rj(path.join(ctx.LOGS, 'clan_state.json'), {}) || {}, clanLeft = {};
  ((cs.warehouse && cs.warehouse.items) || []).forEach(r => { const k = Number(r.id); clanLeft[k] = (clanLeft[k] || 0) + (Number(r.count) || 1); });
  // PARTYSPARE-2026-10-29 (owner: "hand out better accessories to party members"): spare jewelry in the bags of the characters in THIS order
  const SPARE = [], SPARE_USED = new Set(), NAMES = new Set(names);
  try { fs.readdirSync(ctx.LOGS).forEach(f => { const m = /^bag_(.+)\.json$/.exec(f); if (!m || !NAMES.has(m[1])) return; const j = rj(path.join(ctx.LOGS, f), null);
    if (!j || !Array.isArray(j.items) || Date.now() - (Date.parse(j.at || '') || 0) > 6 * 3600000) return;
    j.items.filter(r => !r.eq && !r.equipped && !r.q && !r.quest && (Number(r.enchant) || 0) < 10).forEach(r => { const F = IP.facts(ctx, Number(r.id)); if (F && F.kind === 'jewel' && Number(r.objId)) SPARE.push({ char: m[1], id: Number(r.id), objId: Number(r.objId), enchant: Number(r.enchant) || 0, F }); }); }); } catch (e) { }
  const out = [];
  for (const name of names) {
    const ch = all.find(c => c.name === name); if (!ch) { out.push({ name, error: 'unknown character' }); continue; }
    const rec = rj(path.join(ctx.DATA, 'gear_rec', `${ch.classId}.json`), null), G = rec && rec.grades && rec.grades[grade];
    if (!G) { out.push({ name, error: `no ${grade}-grade gear plan for ${ch.cls || 'this class'}` }); continue; }
    const bag = rj(path.join(ctx.LOGS, `bag_${name}.json`), {}) || {}, items = Array.isArray(bag.items) ? bag.items : [];
    const worn = new Set(items.filter(r => r.eq || r.equipped).map(r => Number(r.id))), inBag = items.filter(r => !(r.eq || r.equipped));
    const lines = [], missing = [], have = [], usedBag = new Set();
    for (const [slot, r] of Object.entries(G)) {
      const ids = [Number(r.id)].concat((r.alt || []).map(Number)).filter(Boolean); if (!ids.length) continue;
      const pairs = /^(earring|ring)$/.test(slot) ? 2 : 1, wornN = items.filter(x => (x.eq || x.equipped) && ids.includes(Number(x.id))).length;
      if (wornN >= pairs) { have.push(`${slot}: ${r.name}`); continue; }
      const F = IP.facts(ctx, ids[0]), base = { id: ids[0], name: r.name || F.name, icon: F.icon, grade: F.grade, slot, enchantTo: 0, saId: 0 };
      // never replace a worn Special Ability weapon of the same grade or higher (gear rule 2026-10-06)
      if (slot === 'weapon') { const ww = items.find(x => (x.eq || x.equipped) && IP.facts(ctx, Number(x.id)).kind === 'weapon'); const WF = ww ? IP.facts(ctx, Number(ww.id)) : null;
        if (WF && WF.sa && 'NONE D C B A S S80 S84'.split(' ').indexOf(String(WF.grade)) >= 'NONE D C B A S S80 S84'.split(' ').indexOf(String(F.grade))) { have.push(`weapon: keeps ${WF.name} (Special Ability)`); continue; } }
      for (let k = wornN; k < pairs; k++) {
      const b = inBag.find(x => ids.includes(Number(x.id)) && !usedBag.has(Number(x.objId)) && !SPARE_USED.has(Number(x.objId)));   // PARTYSPARE: not a piece a teammate already got
      if (b) { usedBag.add(Number(b.objId)); SPARE_USED.add(Number(b.objId)); lines.push(Object.assign({}, base, { id: Number(b.id), src: 'bag', objId: Number(b.objId) || 0, enchant: Number(b.enchant) || 0 })); continue; }
      // PARTYSPARE-2026-10-29: a better neck / earring / ring of this grade from a bag in this order (own bag first, then the best one) beats buying the plan piece
      const wornMd = items.filter(x => (x.eq || x.equipped) && !ids.includes(Number(x.id)) && (IP.facts(ctx, Number(x.id)) || {}).slot === slot).map(x => Number(IP.facts(ctx, Number(x.id)).md) || 0).sort((p, q) => p - q)[k - wornN] || 0;
      const sp = /^(neck|earring|ring)$/.test(slot) && IL.levelOk(grade, ch.level) ? SPARE.filter(s => !SPARE_USED.has(s.objId) && s.F.slot === slot && s.F.grade === grade && (Number(s.F.md) || 0) > wornMd).sort((p, q) => ((q.char === name) - (p.char === name)) || ((Number(q.F.md) || 0) - (Number(p.F.md) || 0)))[0] : null;
      if (sp) { SPARE_USED.add(sp.objId); if (sp.char === name) usedBag.add(sp.objId); lines.push(Object.assign({}, base, { id: sp.id, name: sp.F.name, icon: sp.F.icon, grade: sp.F.grade, src: sp.char === name ? 'bag' : 'char', char: sp.char === name ? '' : sp.char, objId: sp.objId, enchant: sp.enchant })); continue; }
      const cid = ids.find(i => (clanLeft[i] || 0) > 0);
      if (cid) { clanLeft[cid]--; lines.push(Object.assign({}, base, { id: cid, src: 'clan', enchant: 0 })); continue; }
      const sr = shopRows.find(x => ids.includes(Number(x.id)) && !x.common);
      if (sr) { lines.push(Object.assign({}, base, { id: Number(sr.id), src: 'shop', offer: sr.offer, enchant: 0, price: sr.price })); continue; }
      missing.push(`${slot}: ${r.name} (${String(r.src || 'not in a Giran shop').slice(0, 80)})`);
      }
    }
    out.push({ name, cls: ch.cls, level: ch.level, grade, lines, missing, have });
  }
  return { ok: true, grade, chars: out };
}
// PAPERDOLL-2026-10-25 (owner: "select a character and then see their equipped items and click on each slot and select what I want based on what we
// have and what we can create from Giran town ... I don't want to search around and remember all the different things we have"):
//   GET /api/upgrade/doll?name=X            -> the character's slots with what it wears (live bag)
//   GET /api/upgrade/slot?name=X&slot=chest -> every piece for that slot we could give it: any character's bag, its own warehouse, the clan
//        warehouse, a Giran shop (buy), our crafters (craft) - grouped per item with its sources, stats, level / type fit and "better than worn"
const DOLL_SLOTS = [['weapon', 'Weapon'], ['shield', 'Shield'], ['head', 'Head'], ['chest', 'Chest'], ['legs', 'Legs'], ['gloves', 'Gloves'], ['feet', 'Boots'],
  ['neck', 'Necklace'], ['earring', 'Earring', 2], ['ring', 'Ring', 2]];
const GRADE_RANK = { NONE: 0, D: 1, C: 2, B: 3, A: 4, S: 5, S80: 6, S84: 7 };
const statOf = (F) => F.kind === 'weapon' ? Math.max(Number(F.pa) || 0, Number(F.ma) || 0) : F.kind === 'jewel' ? Number(F.md) || 0 : Number(F.pd) || 0;
function recFor(ctx, classId) { const r = rj(path.join(ctx.DATA, 'gear_rec', `${classId}.json`), null); return (r && r.grades) || {}; }
async function doll(ctx, name) {
  if (!NAME_RE.test(name)) return { code: 400, error: 'name?' };
  const C = await IP.charInfo(ctx, name, false); if (C.error) return C;
  const worn = (C.bag || []).filter(r => r.eq);
  const slots = [];
  for (const [k, label, n] of DOLL_SLOTS) {
    const on = worn.filter(r => r.slot === k || (k === 'chest' && r.slot === 'fullarmor'));
    for (let i = 0; i < (n || 1); i++) { const r = on[i] || null; slots.push({ slot: k, label: (n || 1) > 1 ? `${label} ${i + 1}` : label, idx: i, item: r ? { id: r.id, name: r.name, icon: r.icon, grade: r.grade, enchant: r.enchant || 0, objId: r.objId, sa: r.sa || '', common: !!r.common, stat: statOf(r), full: !!r.full } : null }); }
  }
  // the legs slot is taken by a full-body armor
  if (worn.some(r => r.full && r.slot === 'chest')) slots.filter(s => s.slot === 'legs').forEach(s => { s.blocked = 'full-body armor'; });
  return { ok: true, name, level: C.level, cls: C.cls, classId: C.classId, adena: C.adena, online: C.online, slots };
}
let CRAFT_CACHE = { at: 0, v: null };
async function craftables(ctx) {
  if (CRAFT_CACHE.v && Date.now() - CRAFT_CACHE.at < 120000) return CRAFT_CACHE.v;
  const out = {};
  for (const c of (IP.chars(ctx).chars || []).filter(x => x.crafter)) {
    try { const ci = await IP.craftInfo(ctx, c.name); if (!ci || !ci.crafter) continue; (ci.recipes || []).forEach(r => { (out[r.product] = out[r.product] || []).push({ crafter: c.name, recipe: r.list, can: r.can || 0, learned: r.learned }); }); } catch (e) { }
  }
  CRAFT_CACHE = { at: Date.now(), v: out }; return out;
}
// MAKEPICK-2026-10-25 (owner: "it's annoying that I have to search for items ... and it does not work either, I want to select them by seeing their
// icon and grade and type JUST as before"): every gear piece that can be BOUGHT in Giran (every merchant incl. the luxury shop) or CRAFTED by one
// of our crafters, one row per item: icon, grade, kind / slot / type, cheapest offer, every crafter that has the recipe. Cached 2 min.
let CATALOG = { at: 0, v: null };
async function catalog(ctx) {
  if (CATALOG.v && Date.now() - CATALOG.at < 120000) return CATALOG.v;
  const by = {};
  [].concat(...IP.shops(ctx).shops.map(x => x.rows)).filter(r => r.kind && !r.cost && r.price > 0).forEach(r => {
    const e = by[r.id] = by[r.id] || { id: r.id, name: r.name, icon: r.icon, grade: r.grade, kind: r.kind, slot: r.slot, wtype: r.wtype || '', common: !!r.common, sa: r.sa || '', buy: null, craft: [] };
    if (!e.buy || r.price < e.buy.price) e.buy = { npc: r.npc, price: r.price, offer: r.offer || null };
  });
  const cr = await craftables(ctx);
  Object.keys(cr).forEach(pid => { const F = IP.facts(ctx, Number(pid)); if (!F || !/^(weapon|armor|jewel)$/.test(F.kind || '')) return;
    const e = by[pid] = by[pid] || { id: Number(pid), name: F.name, icon: F.icon, grade: F.grade, kind: F.kind, slot: F.slot, wtype: F.wtype || '', common: !!F.common, sa: F.sa || '', buy: null, craft: [] };
    cr[pid].forEach(x => { if (!e.craft.some(y => y.crafter === x.crafter)) e.craft.push({ crafter: x.crafter, recipe: x.recipe, can: x.can || 0 }); }); });
  CATALOG = { at: Date.now(), v: { ok: true, items: Object.values(by) } };
  return CATALOG.v;
}
async function slotCands(ctx, name, slot) {
  if (!NAME_RE.test(name) || !DOLL_SLOTS.some(s => s[0] === slot)) return { code: 400, error: 'name / slot?' };
  const C = await IP.charInfo(ctx, name, false); if (C.error) return C;
  const fits = (F) => F.slot === slot || (slot === 'chest' && F.slot === 'fullarmor');
  const by = {}, add = (id, src) => { const F = IP.facts(ctx, id); if (!F || !fits(F)) return; const e = by[id] = by[id] || { F, src: [] };
    const same = e.src.find(x => x.src === src.src && (x.char || '') === (src.char || '') && (x.enchant || 0) === (src.enchant || 0) && (x.npc || '') === (src.npc || '') && (x.crafter || '') === (src.crafter || ''));
    if (same && /^(clan|wh|char|bag)$/.test(src.src)) { same.count = (same.count || 1) + (src.count || 1); same.label = same.label.replace(/ \(\d+\)$/, '') + ` (${same.count})`; return; }
    if (same) return; e.src.push(src); };
  // this character's own bag (live) + own warehouse
  (C.bag || []).filter(r => !r.eq).forEach(r => add(r.id, { src: 'bag', enchant: r.enchant || 0, objId: r.objId, count: r.count || 1, label: `own bag${r.enchant ? ' +' + r.enchant : ''}` }));
  (C.wh || []).forEach(r => add(r.id, { src: 'wh', enchant: r.enchant || 0, count: r.count || 1, label: `own warehouse${r.enchant ? ' +' + r.enchant : ''}` }));
  // the clan warehouse (one row per enchant level)
  (C.clan || []).forEach(r => add(r.id, { src: 'clan', enchant: r.enchant || 0, count: r.count || 1, label: `clan warehouse${r.enchant ? ' +' + r.enchant : ''}${(r.count || 1) > 1 ? ' (' + r.count + ')' : ''}` }));
  // every other character's bag (the bag report: not worn, no quest items)
  try { fs.readdirSync(ctx.LOGS).forEach(f => { const m = /^bag_(.+)\.json$/.exec(f); if (!m || m[1] === name) return; const j = rj(path.join(ctx.LOGS, f), null);
    if (!j || !Array.isArray(j.items) || Date.now() - (Date.parse(j.at || '') || 0) > 6 * 3600000) return;
    j.items.filter(r => !r.eq && !r.equipped && !r.q).forEach(r => add(Number(r.id), { src: 'char', char: m[1], objId: Number(r.objId) || 0, enchant: Number(r.enchant) || 0, count: Number(r.count) || 1, label: `${m[1]}'s bag` })); }); } catch (e) { }
  // Giran shops (adena)
  [].concat(...IP.shops(ctx).shops.map(x => x.rows)).filter(r => !r.cost && r.price > 0).forEach(r => add(r.id, { src: 'shop', npc: r.npc, price: r.price, offer: r.offer, label: `buy at ${r.npc} · ${IL.kmb(Math.ceil(r.price * 1.2))}` }));
  // our crafters
  const cr = await craftables(ctx);
  Object.keys(cr).forEach(pid => cr[pid].forEach(x => add(Number(pid), { src: 'craft', crafter: x.crafter, recipe: x.recipe, can: x.can, label: `craft: ${x.crafter}${x.can ? ' (materials for ' + x.can + ')' : ' (materials missing)'}` })));
  // what it wears there now, the class's gear plan, its weapon / armor type
  const worn = (C.bag || []).filter(r => r.eq && fits(r)), wornBest = worn.reduce((m, r) => Math.max(m, statOf(r)), 0), wornIds = new Set(worn.map(r => r.id));
  const R = recFor(ctx, C.classId), recIds = new Set(), recTypes = new Set();
  Object.values(R).forEach(G => Object.values(G || {}).forEach(x => { if (!x || !x.id) return; recIds.add(Number(x.id)); (x.alt || []).forEach(a => recIds.add(Number(a))); const f = IP.facts(ctx, Number(x.id)); if (f && fits(f) && f.wtype) recTypes.add(f.wtype); }));
  const items = Object.values(by).map(({ F, src }) => {
    const lvlOk = IL.levelOk(F.grade, C.level), typeOk = !F.wtype || !recTypes.size || recTypes.has(F.wtype);
    return { id: F.id, name: F.name, icon: F.icon, grade: F.grade, wtype: F.wtype, sa: F.sa || '', base: F.base || 0, common: !!F.common, stat: statOf(F), pa: F.pa, ma: F.ma, pd: F.pd, md: F.md,
      levelOk: lvlOk, typeOk, recommended: recIds.has(F.id) || (F.base && recIds.has(F.base)), wornNow: wornIds.has(F.id), better: statOf(F) > wornBest,
      sources: src.sort((a, b) => ['bag', 'wh', 'clan', 'char', 'shop', 'craft'].indexOf(a.src) - ['bag', 'wh', 'clan', 'char', 'shop', 'craft'].indexOf(b.src) || (b.enchant || 0) - (a.enchant || 0)).slice(0, 12) };
  }).sort((a, b) => (b.typeOk - a.typeOk) || (b.levelOk - a.levelOk) || (b.recommended - a.recommended) || ((GRADE_RANK[b.grade] || 0) - (GRADE_RANK[a.grade] || 0)) || (b.stat - a.stat));
  return { ok: true, name, slot, level: C.level, cls: C.cls, worn: worn.map(r => ({ id: r.id, name: r.name, enchant: r.enchant || 0, stat: statOf(r) })), items: items.slice(0, 80), more: Math.max(0, items.length - 80) };
}
// GEARUPCOL-2026-10-29 (owner: "from the party tab ... select what items the group should go get from collector ... unseal to x and equip and give back
// items to collector that is no longer used"): GET /api/upgrade/collector?names=a,b -> the collector's spare gear (its bag report < 6 h; + the clan
// warehouse when the collector is the clan leader, it stores there), each piece with what unsealing makes of it, the named members it beats the
// weakest worn piece of that slot for (level + weapon / armor type fit), `to` = who gains most (greedy, each piece once). Read only; never +10.
function collectorStock(ctx, namesRaw) {
  const col = collectorName(ctx); if (!col) return { ok: true, collector: '', rows: [], why: 'no collector is switched on (Storage page -> Collector)' };
  const fresh = (j) => j && Array.isArray(j.items) && Date.now() - (Date.parse(j.at || '') || 0) <= 6 * 3600000, all = IP.chars(ctx).chars || [];
  const names = String(namesRaw || '').split(',').filter(n => NAME_RE.test(n) && n !== col).slice(0, MAX_CHARS), rows = [];
  const add = (src, r) => { const ench = Number(r.enchant) || 0, u = unsealRow(ctx, Number(r.id)), F0 = IP.facts(ctx, Number(r.id)), F = /^(weapon|armor|jewel)$/.test(F0.kind || '') || !u ? F0 : IP.facts(ctx, u.id);
    if (!/^(weapon|armor|jewel)$/.test(F.kind || '') || ench >= 10) return;   // gear only, never +10
    for (let k = 0; k < (src === 'clan' ? Math.min(10, Number(r.count) || 1) : 1); k++) rows.push({ src, char: src === 'char' ? col : '', objId: src === 'char' ? Number(r.objId) || 0 : 0, id: Number(r.id), name: F0.name,
      icon: F.icon, grade: F.grade, slot: F.slot === 'fullarmor' ? 'chest' : F.slot, wtype: F.wtype || '', enchant: ench, stat: statOf(F), unseal: u ? { id: u.id, name: IP.facts(ctx, u.id).name, pay: u.pay, aa: u.aa } : null, gains: [], to: '' }); };
  const cb = rj(path.join(ctx.LOGS, `bag_${col}.json`), null);
  if (fresh(cb)) cb.items.filter(r => !r.eq && !r.equipped && !r.q && !r.quest).forEach(r => add('char', r));
  if (col === IP.clanLeader(ctx)) ((((rj(path.join(ctx.LOGS, 'clan_state.json'), {}) || {}).warehouse) || {}).items || []).forEach(r => add('clan', r));
  const mem = names.map(n => { const b = rj(path.join(ctx.LOGS, `bag_${n}.json`), null), worn = {};
    if (fresh(b)) b.items.filter(r => r.eq || r.equipped).forEach(r => { const F = IP.facts(ctx, Number(r.id)), s = F.slot === 'fullarmor' ? 'chest' : F.slot; (worn[s] = worn[s] || []).push({ stat: statOf(F), wtype: F.wtype || '' }); });
    return { name: n, level: (all.find(c => c.name === n) || {}).level, worn }; });
  const low = (m, s) => { const L = (m.worn[s] || []).slice().sort((a, b) => a.stat - b.stat); return (/^(earring|ring)$/.test(s) && L.length < 2) || !L.length ? null : L[0]; };
  rows.sort((a, b) => b.stat - a.stat);
  for (const r of rows) {
    r.gains = mem.map(m => { const w = low(m, r.slot); return { name: m.name, gain: r.stat - (w ? w.stat : 0), ok: IL.levelOk(r.grade, m.level) && (!r.wtype || !w || !w.wtype || w.wtype === r.wtype) }; })
      .filter(g => g.ok && g.gain > 0).map(g => ({ name: g.name, gain: g.gain })).sort((a, b) => b.gain - a.gain);
    if (!r.gains.length) continue;
    const m = mem.find(x => x.name === r.gains[0].name), w = low(m, r.slot), L = m.worn[r.slot] = m.worn[r.slot] || [];
    r.to = m.name; if (w) L.splice(L.indexOf(w), 1); L.push({ stat: r.stat, wtype: r.wtype });   // the next piece sees this one as worn
  }
  const use = rows.filter(r => r.gains.length);
  return { ok: true, collector: col, at: (cb && cb.at) || null, rows: use.slice(0, 60), more: Math.max(0, use.length - 60), idle: rows.length - use.length };
}
function status(ctx, ids) {
  return { ok: true, jobs: String(ids || '').split(',').filter(x => /^ij_[a-z0-9_]+$/i.test(x)).slice(0, 40).map(id => {
    const J = rj(path.join(ctx.LOGS, 'itemjobs', id + '.json'), null), st = rj(path.join(ctx.LOGS, 'itemjobs', id + '_status.json'), null) || {};
    return { id, name: J ? J.doer : '', state: st.state || 'sent', step: st.step || '', result: st.result || '', at: st.at || null,
      lines: J && J.upgrade ? J.upgrade.lines.map(l => ({ name: l.item.name, result: l.result || '', why: l.why || '', worn: !!l.worn })) : [], steps: (st.steps || []).slice(-12) };
  }) };
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  dispatchStart(ctx);   // UPGQUEUE: the next-town-visit dispatcher runs with the server (from its first request on)
  if (p === '/upgradepage.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR, 'upgradepage.js'))); return true; }
  if (!p.startsWith('/api/upgrade/')) return false;
  if (!ctx.allowed(req, url)) { ctx.json(res, 401, { error: 'key' }); return true; }
  const out = (r) => { const code = (r && r.code) || 200; if (r) delete r.code; ctx.json(res, code, r || { error: 'no result' }); };
  let b = {}; if (req.method === 'POST') { try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { out({ code: 400, error: 'bad JSON' }); return true; } }
  try {
    const sub = p.slice('/api/upgrade/'.length);
    if (sub === 'plan' && req.method === 'POST') { out(await planAll(ctx, b)); return true; }
    if (sub === 'start' && req.method === 'POST') { out(await start(ctx, b)); return true; }
    if (sub === 'make/plan' && req.method === 'POST') { out(await makePlan(ctx, b)); return true; }   // MAKEX
    if (sub === 'make/start' && req.method === 'POST') { out(await makeStart(ctx, b)); return true; }
    if (sub === 'unseal') { out(await unsealList(ctx, String(url.searchParams.get('name') || ''))); return true; }   // UNSEALPICK: the sealed pieces
    if (sub === 'unseal/plan' && req.method === 'POST') { out(await unsealPlan(ctx, b)); return true; }   // UNSEALPICK
    if (sub === 'unseal/start' && req.method === 'POST') { out(await unsealStart(ctx, b)); return true; }
    if (sub === 'collector') { out(collectorStock(ctx, url.searchParams.get('names'))); return true; }   // GEARUPCOL-2026-10-29
    if (sub === 'preset') { out(preset(ctx, url.searchParams.get('names'), url.searchParams.get('grade'))); return true; }   // PRESET
    if (sub === 'doll') { out(await doll(ctx, String(url.searchParams.get('name') || ''))); return true; }   // PAPERDOLL
    if (sub === 'slot') { out(await slotCands(ctx, String(url.searchParams.get('name') || ''), String(url.searchParams.get('slot') || ''))); return true; }
    if (sub === 'status') { out(status(ctx, url.searchParams.get('ids'))); return true; }
    if (sub === 'send' && req.method === 'POST') { out(await sendNow(ctx, b)); return true; }   // UPGQUEUE: a queued job now (party / solo) or cancel
    if (sub === 'jobs') { out(jobsFor(ctx, url.searchParams.get('names'))); return true; }
    if (sub === 'catalog') { out(await catalog(ctx)); return true; }   // MAKEPICK
    if (sub === 'recommend') { out(await recommend(ctx, String(url.searchParams.get('name') || ''))); return true; }   // RECOMMEND
    out({ code: 404, error: 'unknown upgrade API' }); return true;
  } catch (e) { out({ code: 500, error: e.message }); return true; }
}
module.exports = { collectorStock, unsealList, unsealPlan, unsealStart, unsealRow, catalog, handle, planAll, start, status, collectorName, makePlan, makeStart, preset, doll, slotCands, sendNow, dispatchTick, dispatchStart, jobsFor, recommend, inGiran };
