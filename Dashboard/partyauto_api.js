// PARTY AUTOMATIONS API (owner 2026-10-13: "everything configurable by hand, nothing automatic unless the player switches it on"; the
// party settings popup had no switch for these three, they only followed Start / Stop). Loaded by server.js (one hook, like fundpage_api.js).
//   GET  /api/partyauto     { file, exists, rev, broken, data: { v, default, parties, chars }, kinds: [{ key, label, help, char }],
//                             parties: [{ leader, members, eff: { <kind>: { on, src } }, chars: { <name>: { <kind>: { on, src } } } }] }
//   POST /api/partyauto     { party, values: { <kind>: true | false | null }, chars: { <name>: { <kind>: true | false | null } }, rev?, by? }
//                           only that party's entry (+ the named characters) is changed; null = removed (= the setting for all parties);
//                           rev = the file's sha the caller read (409 + conflict: true when it changed meanwhile); lock + history copy
//                           (Scripts/data/history/party_auto_<time>.json, last 50) + atomic tmp + rename (manual_guard.js) + one line in
//                           Logs/dashboard_commands.log.
// File: Scripts/data/party_auto.json (env SWARM_PARTYAUTO_FILE overrides it: the tests use a scratch copy). Missing = everything OFF.
//   { v: 1, default: { supplyWatch: false, sell: false, dyes: false }, parties: { <leader>: { supplyWatch, sell, dyes } },
//     chars: { <name>: { sell, dyes } } }
// HIVESW-2026-10-15: + skills / heals / potions (group 'combat', DEFAULT ON when missing: def true) and chars.<name>.toggles [skill names]
// (POST chars: { <name>: { toggles: [..] | null } }); GET info also sends fightToggles (the built-in fight whitelist). Serves /hiveswitch.js.
// swarm.js PARTYAUTO-PURE (pautoEffective) reads it live every 5 s — the same rules as pautoEffective below (test_party_auto.js checks both).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const KINDS = [
  { key: 'supplyWatch', char: false, label: 'Supply runs when someone runs low',
    help: 'The leader goes to Giran by himself when a character is low on escape / resurrection scrolls, shots, potions or arrows (or the bag is full), buys for everyone and hands it out.' },
  { key: 'sell', char: true, label: 'Sell junk on town visits',
    help: 'Items you marked "sell" are sold whenever a character idles in a town, and old gear + marked items are sold during supply runs (also the ones you order).' },
  // BUFFSTORE-2026-10-19 (owner: "maybe even take COV before you enter the catacomb, it's barely any adena"): default OFF
  { key: 'storeCov', char: false, label: 'Chant of Victory from a Giran buff store in supply runs',
    help: 'At the end of every supply run in Giran the leader buys Chant of Victory for the whole party from a player buff store near the landing (a seller whose title says COV; about 1 adena per member, 12 hours). Skipped while more than 1 hour is left, or when the store asks more than 5000 adena. Lost on death until the next supply run.' },
  // MAGNUS-2026-10-23 (owner: "the nuker parties are not buying 'Chant of Magus' from town ... it gives even more casting speed")
  { key: 'storeMagnus', char: false, label: "Magnus' Chant (Chant of Magus) from a Giran buff store",
    help: "In every supply run / Giran rebuff the leader buys Magnus' Chant for the whole party from a player buff store near the Giran landing (a Doomcryer seller, about 1 adena per member, 12 hours): more casting speed and less MP use for casters and healers. Skipped while more than 1 hour is left, or when the store asks more than 5000 adena." },
  // VITALITY-2026-10-21 (public tester Vykaax: "refill vitality when in town during resupply"): default OFF
  { key: 'vitality', char: false, label: 'Gift of Vitality in supply runs',
    help: "In every supply run in Giran each character whose vitality is below level 4 walks to Eva's High Priest (Steve Shyagel, next to the Giran temple) and takes the free Gift of Vitality: vitality level 4 for 2 hours (more experience). Each character at most once every 5 hours; when the priest is gone (event over) it tries again 6 hours later. Your order !vitality [name] takes it at once." },
  { key: 'dyes', char: true, label: 'Draw symbols (dyes) in supply runs',
    help: 'During supply runs each character with a symbol plan buys the dyes and draws its next planned symbol at the Symbol Maker in Giran (also in the supply runs you order).' },
  // UNLOADGATE-2026-10-16 (player Vykaax: the leader traded his bag to a follower by itself): default OFF
  { key: 'unload', char: false, label: 'Leader gives spare loot to a teammate when his bag is full',
    help: 'In a supply run, when the leader carries more than 150 kinds of items, he trades what he does not use (materials, spare gear, life stones ...) to the teammate with the most free bag slots. Never potions, shots, scrolls, arrows, event letters or items marked for selling.' },
  // HIVESW-2026-10-15 (player Vykaax: let my own L2Swarm profile fight + heal, Hive keeps pathing / resupply / dashboard): group 'combat' = the party
  // settings popup's Combat section (not Supplies); def: true = ON when nothing is set (today's autopilot for everyone who never touches them)
  { key: 'skills', char: true, def: true, group: 'combat', label: 'Hive picks my skills',
    help: 'On: Hive chooses and casts attacks, area attacks, debuffs, buffs, songs / dances, toggles and the raid role skills. Off: Hive casts nothing by itself — your L2Swarm profile (Combat Skills tab) fights; Hive still walks, follows, resupplies and shows everything here.' },
  { key: 'heals', char: true, def: true, group: 'combat', label: 'Hive heals',
    help: 'On: Hive heals the party (heal choice, group heals, cures, Recharge, Chant of Life, self heals). Off: Hive heals nobody — your L2Swarm profile (Auto Skills tab) heals, and Hive gives back any of your Auto Skills it had switched off.' },
  { key: 'potions', char: true, def: true, group: 'combat', label: 'Hive uses potions',
    help: "On: Hive drinks Healing and Mana Potions when HP or MP run low. Off: no potions by Hive (use L2Swarm's own potion settings or the server's .autohp / .automp)." },
  { key: 'swarmFight', char: false, group: 'combat', label: 'Fight with L2Swarm (Hive only travels)',
    help: "Off (default): Hive runs the fights. On: Hive still travels, picks the hunting spot, restocks, gears up and shows the dashboard. At the spot the leader only sets the combat zone and starts L2Swarm combat; the others follow him with L2Swarm Follow + Follow Attack. Hive picks no targets, makes no pairs and does not walk anyone back there. Skills and heals stay as you set them: with Hive picks my skills / Hive heals on, Hive still casts and heals on the monster L2Swarm picked; switch those off and your L2Swarm profiles (Combat Skills, Auto Skills) cast and heal. Raids, Kamaloka and other instances stay with Hive." },   // SWARMFIGHT-2026-10-16 (player Vykaax), default OFF
];
const KEYS = KINDS.map(k => k.key), CHAR_KEYS = KINDS.filter(k => k.char).map(k => k.key);
// = swarm.js TOGGLE-PURE FIGHT_TOGGLES: the toggles Hive switches ON in fights for anyone (the dashboard shows them as 'always on in fights')
const FIGHT_TOGGLES = ['Soul Cry', 'Vicious Stance', 'Accuracy', 'Focus Attack', 'Polearm Accuracy', 'Fury Fists'];
const ABOUT = 'Party automations (dashboard -> party card -> Settings -> Supplies). Missing party / character = the "default" values; the public package ships every one OFF. supplyWatch = automatic supply runs when someone is low; sell = selling on town visits + in supply runs; dyes = drawing planned symbols in supply runs. amounts (party / default) = what each character carries per level band (1, 20, 40, 52, 61, 76): soulshots, spiritshots, mana, healing, soe, sor; missing = the built-in amounts. pshop (party / default; missing = OFF) = buy B / A / S shots from player shops in Giran during supply runs: on, max { soulshot | blessed | spiritshot: { B, A, S } } (0 / missing = never), budget (adena per run), keep (the leader never goes below), maxAgeMin (scan age), scan (scan first when older). Your orders (!supply, !sell, !dyes, !pshop) always work. skills / heals / potions (party, chars.<name>; missing = ON) = Hive picks skills / heals / drinks potions; OFF = the L2Swarm profile does it. chars.<name>.toggles = fight toggles the player ticked. Read live by swarm.js every 5 s.';
let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_PARTYAUTO_FILE || (ctx && ctx.partyAutoFile) || path.join(ctx.DATA, 'party_auto.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const isoNow = () => new Date().toISOString();
const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};

// ---- the same rules as swarm.js PARTYAUTO-PURE
function pautoNorm(j) {
  const o = obj(j);
  return Object.assign({}, o, { v: 1, default: obj(o.default), parties: obj(o.parties), chars: obj(o.chars) });
}
function pautoEffective(j, kind, me, leader) {
  const K = KINDS.find(k => k.key === kind); if (!K) return { on: false, src: 'unknown' };
  const J = pautoNorm(j), c = obj(J.chars[me]), p = obj(J.parties[leader]);
  if (K.char && typeof c[kind] === 'boolean') return { on: c[kind], src: 'char' };
  if (typeof p[kind] === 'boolean') return { on: p[kind], src: 'party' };
  if (typeof J.default[kind] === 'boolean') return { on: J.default[kind], src: 'default' };
  return { on: K.def === true, src: 'default' };                       // HIVESW: missing = the kind's own default (skills / heals / potions ON)
}
/** HIVESW: the fight toggles the player ticked for this character (= swarm.js pautoToggles) */
function pautoToggles(j, me) {
  const J = pautoNorm(j), c = J.chars[me], t = c && typeof c === 'object' ? c.toggles : null;
  return Array.isArray(t) ? t.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, 30) : [];
}
const TOGGLE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 '\-:.]{0,39}$/;   // a skill name as the client shows it

// SUPPLYAMT 2026-10-14: how much each character carries, per level band (= weapon grade): party > default (all parties) > built-in.
// parties.<leader>.amounts / default.amounts = { "<band start>": { soulshots, spiritshots, mana, healing, soe, sor } }. Same as swarm.js pautoAmounts.
const BANDS = [1, 20, 40, 52, 61, 76];
const BAND_LABEL = { 1: 'Level 1–19 (no grade)', 20: 'Level 20–39 (D grade)', 40: 'Level 40–51 (C grade)', 52: 'Level 52–60 (B grade)', 61: 'Level 61–75 (A grade)', 76: 'Level 76+ (S grade)' };
const AMT_KEYS = ['soulshots', 'spiritshots', 'mana', 'healing', 'soe', 'sor', 'ore'];   // = swarm.js PAUTO_AMT_KEYS (ORE 2026-10-14: + Spirit Ore)
const AMT_INFO = { soulshots: { label: 'Soulshots', short: 'Soulshots', max: null }, spiritshots: { label: 'Spiritshots', short: 'Spiritshots', max: null },
  mana: { label: 'Mana Potions', short: 'Mana pots', max: 100000 }, healing: { label: 'Healing Potions', short: 'Heal pots', max: 50000 },
  soe: { label: 'Scrolls of Escape', short: 'Escape', max: 2000 }, sor: { label: 'Scrolls of Resurrection', short: 'Res scrolls', max: 2000 },
  ore: { label: 'Spirit Ore (only characters whose skills eat it: Major Heal, cubics, summons)', short: 'Spirit Ore', max: 500000 } };   // LIMITS-2026-10-22 (public tester: 25k Spirit Ore was refused): all limits x5-x25
// = swarm.js CONFIG.lead.supply (shotsFighter, shotsMage, manaPotions, healingPotions || 30, soe, sor): what a character carries when nothing is set
const BUILTIN = { soulshots: 10000, spiritshots: 5000, mana: 2000, healing: 30, soe: 5, sor: 3, ore: 300 };   // ore = CONFIG.lead.supply.oreUsers
// "Fill in suggested amounts" on the dashboard: cheap at low levels, more as the grade (and the shot use) grows
const SUGGEST = { 1: { soulshots: 1000, spiritshots: 500, mana: 50, healing: 20, soe: 3, sor: 1, ore: 20 }, 20: { soulshots: 3000, spiritshots: 1500, mana: 300, healing: 30, soe: 5, sor: 2, ore: 50 },
  40: { soulshots: 5000, spiritshots: 2500, mana: 1000, healing: 30, soe: 5, sor: 3, ore: 100 }, 52: { soulshots: 8000, spiritshots: 4000, mana: 1500, healing: 30, soe: 5, sor: 3, ore: 200 },
  61: { soulshots: 10000, spiritshots: 5000, mana: 2000, healing: 30, soe: 5, sor: 3, ore: 300 }, 76: { soulshots: 10000, spiritshots: 5000, mana: 2000, healing: 30, soe: 5, sor: 3, ore: 500 } };
function pautoAmounts(j, leader, level, builtin) {
  const J = pautoNorm(j), lv = Math.max(1, Number(level) || 1), band = BANDS.filter(b => b <= lv).pop() || 1;
  const pick = (src) => { const a = src && typeof src === 'object' ? src.amounts : null, r = a && typeof a === 'object' ? a[String(band)] : null; return r && typeof r === 'object' ? r : {}; };
  const good = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
  const P = pick(J.parties[leader]), D = pick(J.default), out = { band, src: {} };
  AMT_KEYS.forEach(k => {
    if (good(P[k])) { out[k] = Math.round(Number(P[k])); out.src[k] = 'party'; }
    else if (good(D[k])) { out[k] = Math.round(Number(D[k])); out.src[k] = 'default'; }
    else { out[k] = Number((builtin || BUILTIN)[k]) || 0; out.src[k] = 'builtin'; }
  });
  return out;
}
/** an amounts table from a POST -> { ok, table | null } ; null / {} = remove */
function amountsIn(t, where, errors) {
  if (t === null) return null;
  if (!t || typeof t !== 'object' || Array.isArray(t)) { errors.push(where + ': a table of level bands'); return undefined; }
  const out = {};
  Object.keys(t).forEach(b => {
    if (!BANDS.includes(Number(b))) { errors.push(`${where}: unknown level band "${String(b).slice(0, 10)}"`); return; }
    const row = t[b]; if (row === null) return;
    if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`${where} ${b}: a row of amounts`); return; }
    const r = {};
    Object.keys(row).forEach(k => {
      if (!AMT_KEYS.includes(k)) { errors.push(`${where} ${b}: unknown item "${String(k).slice(0, 20)}"`); return; }
      const v = row[k]; if (v === null || v === '') return;
      const n = Number(v);
      const mx = AMT_INFO[k].max;   // NOLIMIT-2026-10-22 (owner: shots have no limit, whatever the player wants to give): max null = any whole number
      if (!Number.isSafeInteger(n) || n < 0 || (mx !== null && n > mx)) { errors.push(`${where} ${BAND_LABEL[b]}: ${AMT_INFO[k].label} must be a whole number ${mx !== null ? 'from 0 to ' + mx : '(0 or more)'}`); return; }
      r[k] = n;
    });
    if (Object.keys(r).length) out[String(b)] = r;
  });
  return Object.keys(out).length ? out : null;
}

// PSHOP-2026-10-15 (owner "Shots step 2"): buy B / A / S shots from PLAYER shops in Giran at or below a max price, in supply runs (the leader).
// parties.<leader>.pshop (default.pshop = every party without its own; missing = OFF) =
//   { on, max: { soulshot: { B, A, S }, blessed: { B, A, S }, spiritshot: { B, A, S } }, budget, keep, maxAgeMin, scan }
// max 0 / missing = never buy that one from players. Same reading as swarm.js PSHOP-PURE pshopCfg (test_pshop_shots.js checks both).
const PSHOP_GRADES = ['B', 'A', 'S'];
const PSHOP_KINDS = [
  { key: 'soulshot', label: 'Soulshots', ids: { B: 1465, A: 1466, S: 1467 } },
  { key: 'blessed', label: 'Blessed Spiritshots', ids: { B: 3950, A: 3951, S: 3952 } },
  { key: 'spiritshot', label: 'Spiritshots (plain — only when blessed ones of that grade cannot be had)', ids: { B: 2512, A: 2513, S: 2514 } },
];
const PSHOP_DEF = { budget: 5000000, keep: 1000000, maxAgeMin: 120 };
const PSHOP_LIM = { price: 10000000, budget: 100000000000, keep: 100000000000, maxAgeMin: 1440 };
function pshopCfg(j, leader) {
  const o = obj, J = o(j), P = o(o(J.parties)[leader]).pshop, D = o(J.default).pshop;
  const has = (x) => !!(x && typeof x === 'object' && !Array.isArray(x)), src = has(P) ? P : has(D) ? D : {};
  const n = (v, d) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? d : Math.round(Number(v)));
  const max = {};
  PSHOP_KINDS.forEach(k => { const m = o(o(src.max)[k.key]); max[k.key] = {}; PSHOP_GRADES.forEach(g => { max[k.key][g] = n(m[g], 0); }); });
  return { on: src.on === true, max, budget: n(src.budget, PSHOP_DEF.budget), keep: n(src.keep, PSHOP_DEF.keep), maxAgeMin: Math.max(5, n(src.maxAgeMin, PSHOP_DEF.maxAgeMin)),
    scan: src.scan !== false, src: has(P) ? 'party' : has(D) ? 'default' : 'none' };
}
/** a pshop table from a POST -> the cleaned table | null (remove) | undefined (errors pushed) */
function pshopIn(t, errors) {
  if (t === null) return null;
  if (!t || typeof t !== 'object' || Array.isArray(t)) { errors.push('player shops: a settings table'); return undefined; }
  const out = {}, bad0 = errors.length;
  const whole = (v, lim, what) => { if (v === null || v === undefined || v === '') return undefined; const x = Number(v); if (!Number.isFinite(x) || x < 0 || Math.round(x) !== x || x > lim) { errors.push(`player shops: ${what} must be a whole number from 0 to ${lim.toLocaleString('en-US')}`); return undefined; } return x; };
  Object.keys(t).forEach(k => { if (!['on', 'max', 'budget', 'keep', 'maxAgeMin', 'scan'].includes(k)) errors.push(`player shops: unknown setting "${String(k).slice(0, 20)}"`); });
  if (t.on !== undefined) { if (typeof t.on !== 'boolean') errors.push('player shops: on must be true or false'); else out.on = t.on; }
  if (t.scan !== undefined) { if (typeof t.scan !== 'boolean') errors.push('player shops: scan must be true or false'); else out.scan = t.scan; }
  ['budget', 'keep', 'maxAgeMin'].forEach(k => { const v = whole(t[k], PSHOP_LIM[k], { budget: 'the most per run', keep: 'always keep', maxAgeMin: 'scan age (minutes)' }[k]); if (v !== undefined) out[k] = v; });
  if (out.maxAgeMin !== undefined && out.maxAgeMin < 5) { errors.push('player shops: the scan age must be at least 5 minutes'); }
  if (t.max !== undefined && t.max !== null) {
    if (typeof t.max !== 'object' || Array.isArray(t.max)) errors.push('player shops: max prices must be a table');
    else {
      const m = {};
      Object.keys(t.max).forEach(k => {
        const K = PSHOP_KINDS.find(x => x.key === k); if (!K) { errors.push(`player shops: unknown shot kind "${String(k).slice(0, 20)}"`); return; }
        const row = t.max[k]; if (row === null) return;
        if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`player shops: ${K.label} prices must be a table`); return; }
        const r = {};
        Object.keys(row).forEach(g => { if (!PSHOP_GRADES.includes(g)) { errors.push(`player shops: unknown grade "${String(g).slice(0, 5)}"`); return; } const v = whole(row[g], PSHOP_LIM.price, `the max price for ${K.label.split(' (')[0]} (${g})`); if (v !== undefined && v > 0) r[g] = v; });
        if (Object.keys(r).length) m[k] = r;
      });
      if (Object.keys(m).length) out.max = m;
    }
  }
  if (errors.length > bad0) return undefined;
  return Object.keys(out).length ? out : null;
}

function readFile(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { exists: false, raw: '', rev: '', data: pautoNorm({}) }; }
  try { return { exists: true, raw, rev: sha(raw), data: pautoNorm(raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {}) }; }
  catch (e) { return { exists: true, raw, rev: sha(raw), data: null, broken: e.message }; }
}
function parties(ctx) {
  try { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx).map(p => ({ leader: p.leader, names: p.names })); }
  catch (e) { return []; }
}
function info(ctx) {
  const R = readFile(ctx), D = R.data || pautoNorm({});
  const P = parties(ctx).map(({ leader, names }) => {
    const eff = {}, chars = {};
    KEYS.forEach(k => { eff[k] = pautoEffective(D, k, leader, leader); });
    names.forEach(n => { chars[n] = {}; CHAR_KEYS.forEach(k => { chars[n][k] = pautoEffective(D, k, n, leader); }); chars[n].toggles = pautoToggles(D, n); });   // HIVESW: + the ticked fight toggles
    return { leader, members: names, eff, chars };
  });
  const amounts = { bands: BANDS.map(b => ({ start: b, label: BAND_LABEL[b] })), keys: AMT_KEYS.map(k => Object.assign({ key: k }, AMT_INFO[k])), builtin: BUILTIN, suggest: SUGGEST };
  const pshop = { kinds: PSHOP_KINDS, grades: PSHOP_GRADES, defaults: PSHOP_DEF, limits: PSHOP_LIM };   // PSHOP-2026-10-15
  return { file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken || null, data: D, kinds: KINDS, parties: P, amounts, fightToggles: FIGHT_TOGGLES, pshop };
}

/** apply one party's change to the file's data -> { ok, data } | { ok: false, errors } */
function applyChange(data, b) {
  const errors = [], J = JSON.parse(JSON.stringify(pautoNorm(data)));
  const party = String((b && b.party) || '').trim();
  if (!NAME_RE.test(party)) return { ok: false, errors: ['party: not a character name'] };
  const vals = obj(b.values), chars = obj(b.chars);
  const bad = (v) => !(v === true || v === false || v === null);
  if (Object.keys(vals).length) {
    const P = Object.assign({}, obj(J.parties[party]));
    Object.keys(vals).forEach(k => {
      if (!KEYS.includes(k)) { errors.push(`unknown setting "${String(k).slice(0, 30)}"`); return; }
      if (bad(vals[k])) { errors.push(`${k}: true, false or null`); return; }
      if (vals[k] === null) delete P[k]; else P[k] = vals[k];
    });
    if (Object.keys(P).length) J.parties[party] = P; else delete J.parties[party];
  }
  if (b.amounts !== undefined) {   // SUPPLYAMT: this party's whole table (null = removed: the all-parties / built-in amounts)
    const t = amountsIn(b.amounts, 'amounts', errors);
    if (t !== undefined) { const P = Object.assign({}, obj(J.parties[party])); if (t) P.amounts = t; else delete P.amounts; if (Object.keys(P).length) J.parties[party] = P; else delete J.parties[party]; }
  }
  if (b.defaultAmounts !== undefined) {   // SUPPLYAMT: the table for every party without its own
    const t = amountsIn(b.defaultAmounts, 'all-parties amounts', errors);
    if (t !== undefined) { const Dd = Object.assign({}, J.default); if (t) Dd.amounts = t; else delete Dd.amounts; J.default = Dd; }
  }
  if (b.pshop !== undefined) {   // PSHOP-2026-10-15: this party's whole player-shop table (null = removed: the all-parties table / OFF)
    const t = pshopIn(b.pshop, errors);
    if (t !== undefined) { const P = Object.assign({}, obj(J.parties[party])); if (t) P.pshop = t; else delete P.pshop; if (Object.keys(P).length) J.parties[party] = P; else delete J.parties[party]; }
  }
  if (Object.keys(chars).length > 60) errors.push('characters: at most 60 per save');
  Object.keys(chars).forEach(n => {
    if (!NAME_RE.test(n)) { errors.push(`character "${String(n).slice(0, 40)}": not a character name`); return; }
    const C = Object.assign({}, obj(J.chars[n])), cv = obj(chars[n]);
    Object.keys(cv).forEach(k => {
      if (k === 'toggles') {   // HIVESW-2026-10-15: the fight toggles the player ticked (skill names); null / [] = none of its own
        const t = cv[k];
        if (t === null || (Array.isArray(t) && !t.length)) { delete C.toggles; return; }
        if (!Array.isArray(t) || t.length > 30) { errors.push(`${n} toggles: a list of at most 30 skill names`); return; }
        const badN = t.filter(x => typeof x !== 'string' || !TOGGLE_NAME_RE.test(x.trim()));
        if (badN.length) { errors.push(`${n} toggles: "${String(badN[0]).slice(0, 40)}" is not a skill name`); return; }
        C.toggles = [...new Set(t.map(x => x.trim()))];
        return;
      }
      if (!CHAR_KEYS.includes(k)) { errors.push(`${n}: "${String(k).slice(0, 30)}" has no per-character setting`); return; }
      if (bad(cv[k])) { errors.push(`${n} ${k}: true, false or null`); return; }
      if (cv[k] === null) delete C[k]; else C[k] = cv[k];
    });
    if (Object.keys(C).length) J.chars[n] = C; else delete J.chars[n];
  });
  if (Object.keys(J.parties).length > 300) errors.push('parties: at most 300');
  return errors.length ? { ok: false, errors } : { ok: true, data: J };
}
function bad(code, error, extra) { return Object.assign({ code, error }, extra || {}); }
function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const F = fileOf(ctx), Gd = guard(ctx), by = String(b.by || 'dashboard').slice(0, 40);
  fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  try {
    Gd.withLock(F, () => {
      const R = readFile(ctx);
      if (R.broken) { result = bad(500, `${path.basename(F)} does not parse (${R.broken}) — fix or restore it from history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== R.rev) { result = bad(409, 'the party automations were changed meanwhile (another page or a tool) — reload and try again', { rev: R.rev, conflict: true }); return; }
      const a = applyChange(R.data, b);
      if (!a.ok) { result = bad(400, a.errors.join('; '), { errors: a.errors }); return; }
      const out = Object.assign({ _about: ABOUT }, a.data, { v: 1 });
      if (!R.exists) out.default = Object.assign({ supplyWatch: false, sell: false, dyes: false }, out.default);
      out._updated = isoNow();
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(out, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      const what = JSON.stringify({ party: b.party, values: b.values || {}, chars: b.chars || {}, amounts: b.amounts, defaultAmounts: b.defaultAmounts, pshop: b.pshop }).slice(0, 900);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tpartyauto\tsave\t${by}: ${what}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), data: pautoNorm(out), history: hist ? path.basename(hist) : null };
    }, { who: 'partyauto save' });
  } catch (e) { return bad(500, e.message); }
  return result;
}

async function handle(req, res, url, ctx) {
  if (url.pathname === '/hiveswitch.js') {   // HIVESW-2026-10-15: the character page's Combat box (public, no secrets)
    try { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(__dirname, 'hiveswitch.js'))); }
    catch (e) { res.writeHead(404); res.end(); }
    return true;
  }
  if (url.pathname !== '/api/partyauto') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { pshopCfg, pshopIn, PSHOP_KINDS, PSHOP_GRADES, PSHOP_DEF, handle, info, post, readFile, fileOf, applyChange, pautoNorm, pautoEffective, pautoToggles, FIGHT_TOGGLES, pautoAmounts, amountsIn, BANDS, AMT_KEYS, BUILTIN, SUGGEST, KINDS, KEYS, CHAR_KEYS, ABOUT };
