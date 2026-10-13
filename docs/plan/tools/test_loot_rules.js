// OFFLINE TEST of the LOOT RULES (owner 2026-10-13 22:10: an S80 "Sealed Moirai Helmet" Spoiler6's party looted was handed to Dagger1, the clan collector,
// by itself — "an OPTIONAL LOOT RULE per party"). Never talks to the game:
//   node docs/plan/tools/test_loot_rules.js        (exit code 1 when a check fails)
// 1) The decisions (Dashboard/lootlogic.js): owner rule (keep S-grade), public default (no rule = keep everything), every mode, never / always lists,
//    enchanted / special ability, enchant scrolls, scopes ('loot' vs 'other'), plain sentences.
// 2) swarm.js LOOTRULE-PURE gives the SAME answers as Dashboard/lootlogic.js on a matrix of rules x items x scopes.
// 3) swarm.js host part with a stubbed host (the Spoiler6 replay): lootRowsMine leaves the helmet in the bag and logs "kept: Sealed Moirai Helmet (S80
//    gear — party rule: keep S-grade)"; hovLootGate filters automatic orders (loot / letters / clan items) at trade time, never your own orders;
//    unloadItems keeps it too.
// 4) Dashboard/lootrules_api.js on a scratch file: validation, only the party's entry changes, other keys ("note") stay, null removes, conflict (409),
//    history copy, missing file = every party off.
// 5) Source / install checks: the gates are wired (hovGive x2, unloadItems, lootrows kept), the server hook, the page wiring, the owner's file
//    (5 spoil parties: S-grade kept), the public package never ships loot_rules.json (= off).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const blk = (s, b, e) => { const i = s.indexOf(b), j = s.indexOf(e, i); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return s.slice(i, j); };
const LL = require(path.join(ROOT, 'Dashboard', 'lootlogic.js'));
const PURE = blk(src, '// LOOTRULE-PURE-BEGIN', '// LOOTRULE-PURE-END');
const S = new Function(PURE + '\nreturn { LOOT_MODES, LOOT_GRADES, LOOT_DEF, lootEntry, lootList, lootNorm, lootListMatch, lootGradesText, lootKeepWhy, lootSplit, lootReceiver, lootOrderScope };')();
let fails = 0, n = 0;
const check = (ok, what, info) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok || info === undefined ? '' : ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)))); if (!ok) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- items
const HELM = { id: 15694, objId: 501, name: 'Sealed Moirai Helmet', gear: true, grade: 'S80', count: 1 };
const DC = { id: 365, objId: 502, name: 'Dark Crystal Breastplate', gear: true, grade: 'A', count: 1 };
const DC3 = Object.assign({}, DC, { objId: 503, enchant: 3 });
const SOV = { id: 148, objId: 504, name: 'Sword of Valhalla - Health', gear: true, grade: 'A', special: true, count: 1 };
const FPA = { id: 356, objId: 505, name: 'Full Plate Armor', gear: true, grade: 'C', count: 1 };
const DRAC = { id: 6372, objId: 506, name: 'Draconic Bow', gear: true, grade: 'S', count: 1 };
const S84 = { id: 14104, objId: 507, name: 'Vesper Breastplate', gear: true, grade: 'S84', count: 1 };
const STEM = { id: 1864, objId: 601, name: 'Stem', gear: false, count: 120 };
const REC = { id: 1805, objId: 602, name: 'Recipe: Soulshot (C-grade)', gear: false, count: 1 };
const LET = { id: 3875, objId: 603, name: 'L2Day - A', gear: false, count: 4 };
const ENCH = { id: 959, objId: 604, name: 'Scroll: Enchant Weapon (S-grade)', gear: false, enchantScroll: true, count: 2 };
const MANA = { id: 728, objId: 605, name: 'Mana Potion', gear: false, count: 300 };
const ITEMS = [HELM, DC, DC3, SOV, FPA, DRAC, S84, STEM, REC, LET, ENCH, MANA];

// ---- 1) decisions
const OWNER = { on: true, to: 'clanleader', enchant: true, adenaAbove: 0, mode: 'grade', keepGrades: ['S', 'S80', 'S84'], keepEnchanted: false, keepSpecial: false, never: [], always: [] };
check(LL.lootKeepWhy(OWNER, HELM, 'loot') === 'S80 gear — party rule: keep S-grade', 'owner rule: the Sealed Moirai Helmet (S80) stays with the finder — "S80 gear — party rule: keep S-grade"', LL.lootKeepWhy(OWNER, HELM, 'loot'));
check(/^S gear/.test(LL.lootKeepWhy(OWNER, DRAC, 'loot')) && /^S84 gear/.test(LL.lootKeepWhy(OWNER, S84, 'loot')), 'owner rule: S and S84 gear stay too');
check([DC, DC3, SOV, FPA, STEM, REC, LET, ENCH].every(i => LL.lootKeepWhy(OWNER, i, 'loot') === ''), 'owner rule: everything else goes (A / C gear, enchanted A, special A, materials, recipes, letters, enchant scrolls) = today\'s behaviour');
check(LL.lootKeepWhy(null, STEM, 'loot') !== '' && LL.lootKeepWhy(null, HELM, 'loot') !== '', 'public default (no rule): everyone keeps everything (loot scope)');
check(LL.lootKeepWhy(null, HELM, 'other') === '' && LL.lootKeepWhy(null, LET, 'other') === '', 'no rule: the other hand-overs (letters / clan items / unload) are not touched');
check(LL.lootKeepWhy({ on: false }, STEM, 'loot') !== '' && LL.lootKeepWhy({ on: false }, HELM, 'other') === '', 'rule switched off: the loot hand-over keeps everything; the other hand-overs are not touched');
const ALL = { on: true, mode: 'all' };
check(ITEMS.every(i => LL.lootKeepWhy(ALL, i, 'loot') === ''), 'mode all: everything goes (the 2026-10-12 behaviour)');
check(LL.lootKeepWhy({ to: 'clanleader', enchant: true, adenaAbove: 0 }, HELM, 'loot') === '', 'an old 2026-10-12 entry (no "on", no "mode") = on + everything (back-compatible)');
const NONGEAR = { on: true, mode: 'nongear' };
check([HELM, DC, FPA, SOV].every(i => /^gear — party rule: hand only non-gear$/.test(LL.lootKeepWhy(NONGEAR, i, 'loot'))) && [STEM, REC, LET, ENCH].every(i => LL.lootKeepWhy(NONGEAR, i, 'loot') === ''), 'mode nongear: every gear piece stays, materials / recipes / letters / scrolls go');
const LIST = { on: true, mode: 'list', always: ['Stem', 728] };
check(LL.lootKeepWhy(LIST, STEM, 'loot') === '' && LL.lootKeepWhy(LIST, MANA, 'loot') === '' && LL.lootKeepWhy(LIST, REC, 'loot') !== '' && LL.lootKeepWhy(LIST, HELM, 'loot') !== '', 'mode list: only the always-give items (by name and by id) go');
const GRADE_DEF = { on: true, mode: 'grade' };
check(LL.lootKeepWhy(GRADE_DEF, HELM, 'loot') !== '' && /\+3 enchanted/.test(LL.lootKeepWhy(GRADE_DEF, DC3, 'loot')) && /special ability/.test(LL.lootKeepWhy(GRADE_DEF, SOV, 'loot')) && LL.lootKeepWhy(GRADE_DEF, DC, 'loot') === '' && LL.lootKeepWhy(GRADE_DEF, FPA, 'loot') === '',
  'mode grade with the defaults: S-grade+, enchanted and special-ability gear stay; plain A / C gear goes');
const GA = { on: true, mode: 'grade', keepGrades: ['A', 'S', 'S80', 'S84'], keepEnchanted: false, keepSpecial: false };
check(/^A gear — party rule: keep A-grade and up$/.test(LL.lootKeepWhy(GA, DC, 'loot')) && LL.lootKeepWhy(GA, FPA, 'loot') === '', 'keep A-grade and up: the text says "keep A-grade and up"', LL.lootKeepWhy(GA, DC, 'loot'));
const NEVER = { on: true, mode: 'all', never: ['moirai', 365], always: ['Moirai', 'Stem'] };
check(LL.lootKeepWhy(NEVER, HELM, 'loot') === 'on the never-give list ("moirai")' && /never-give list \("365"\)/.test(LL.lootKeepWhy(NEVER, DC, 'loot')), 'never list (part of a name, any case; an item id) keeps it — and wins over the always list');
check(LL.lootKeepWhy(NEVER, HELM, 'other') !== '' && LL.lootKeepWhy({ on: false, never: ['L2Day'] }, LET, 'other') !== '', 'the never list also protects the other hand-overs (letters / clan items / unload), even with the loot hand-over off');
const ALWAYS = { on: true, mode: 'grade', always: ['Moirai'] };
check(LL.lootKeepWhy(ALWAYS, HELM, 'loot') === '' && LL.lootKeepWhy(ALWAYS, DRAC, 'loot') !== '', 'the always list wins over the grade rule (loot scope)');
check(LL.lootKeepWhy(ALWAYS, HELM, 'other') !== '', '… but not in the other hand-overs (the always list is for the loot collector only)');
check(/enchant scroll/.test(LL.lootKeepWhy({ on: true, enchant: false }, ENCH, 'loot')) && LL.lootKeepWhy({ on: true }, ENCH, 'loot') === '', 'enchant scrolls: kept when "Hand enchant scrolls too" is off');
check(LL.lootKeepWhy(OWNER, HELM, 'other') !== '' && LL.lootKeepWhy(OWNER, STEM, 'other') === '', 'scope other: the gear rules still keep the S80 helmet (e.g. the leader\'s unload), non-gear is untouched');
check(LL.lootGradesText(['S', 'S80', 'S84']) === 'S-grade' && LL.lootGradesText(['B', 'A', 'S', 'S80', 'S84']) === 'B-grade and up' && LL.lootGradesText(['B', 'S80']) === 'B / S80-grade' && LL.lootGradesText([]) === 'no grade', 'grade words: S-grade / B-grade and up / B / S80-grade');
const sp = LL.lootSplit(OWNER, ITEMS, 'loot');
check(sp.kept.map(k => k.name).join(',') === 'Sealed Moirai Helmet,Draconic Bow,Vesper Breastplate' && sp.give.length === ITEMS.length - 3, 'lootSplit: the owner rule keeps exactly the three S-grade+ pieces', sp.kept.map(k => k.name));
check(LL.lootReceiver(OWNER, 'Dagger1') === 'Dagger1' && LL.lootReceiver({ to: 'Spoiler2' }, 'Dagger1') === 'Spoiler2', 'receiver: clanleader -> the clan leader; a name stays');
check(/^Everything goes to Dagger1, except S-grade gear — that stays with the finder\.$/.test(LL.lootSummary(OWNER, 'Dagger1')), 'plain sentence (owner): "Everything goes to Dagger1, except S-grade gear — that stays with the finder."', LL.lootSummary(OWNER, 'Dagger1'));
check(/^Off — everyone keeps/.test(LL.lootSummary(null, 'Dagger1')) && /^Off/.test(LL.lootSummary({ on: false }, 'Q')), 'plain sentence (no rule / off): "Off — everyone keeps what it finds …"');
check(/stays with the finder/.test(LL.lootSummary(NONGEAR, 'Q')) && /Only the listed items go to Q/.test(LL.lootSummary(LIST, 'Q')) && /^Everything the party finds goes to Q/.test(LL.lootSummary(ALL, 'Q')), 'plain sentences for nongear / list / all');
const ex = LL.lootExamples(OWNER);
check(ex.length >= 6 && ex[0].name === 'Sealed Moirai Helmet' && !ex[0].give && ex.slice(1).every(e => e.give), 'dashboard examples (owner rule): the helmet stays, the rest goes', ex.map(e => e.name + ':' + e.give));
check(LL.lootExamples(null).every(e => !e.give), 'dashboard examples (off): everything stays');
check(eq(LL.lootList([' Moirai ', 'moirai', '15694', 15694, '', null, 'x'.repeat(61), 0]), ['Moirai', 15694]), 'list cleaning: trims, numbers as ids, no doubles (any case), no empty / too long / 0', LL.lootList([' Moirai ', 'moirai', '15694', 15694, '', null, 'x'.repeat(61), 0]));

// ---- 2) swarm.js LOOTRULE-PURE == Dashboard/lootlogic.js
const RULES = [null, OWNER, ALL, NONGEAR, LIST, GRADE_DEF, GA, NEVER, ALWAYS, { on: false }, { on: true, enchant: false }, { on: true, mode: 'bogus', keepGrades: ['s80', 'X'], never: 'x' }, { to: 'clanleader' }];
let diff = 0;
RULES.forEach(r => ITEMS.forEach(i => ['loot', 'other'].forEach(sc => { if (S.lootKeepWhy(r, i, sc) !== LL.lootKeepWhy(r, i, sc)) diff++; })));
RULES.forEach(r => { if (!eq(S.lootNorm(r), LL.lootNorm(r))) diff++; if (S.lootReceiver(r, 'Q') !== LL.lootReceiver(r, 'Q')) diff++; });
check(diff === 0, `swarm.js LOOTRULE-PURE and Dashboard/lootlogic.js agree on ${RULES.length} rules x ${ITEMS.length} items x 2 scopes`, diff + ' differences');
check(eq(S.LOOT_DEF, LL.LOOT_DEF) && eq(S.LOOT_MODES, LL.LOOT_MODES) && eq(S.LOOT_GRADES, LL.LOOT_GRADES), 'same defaults / modes / grades');
check(S.lootOrderScope('loot_spoiler6_abc') === 'loot' && S.lootOrderScope('letters_bishop1_x1') === 'other' && S.lootOrderScope('clanlvl_doomed_x') === 'other' && S.lootOrderScope('trade_20261013_x') === '' && S.lootOrderScope('') === '', 'order scopes: loot_ = loot rule, letters_ / clanlvl_ = never-list + gear rules, anything else (your own Trade page orders) = never filtered');

// ---- 3) swarm.js host part, stubbed (the Spoiler6 replay)
const HOST = blk(src, 'var LOOTR = { j: null', "App.on('swarm.hovcall'");
const UNLOAD = blk(src, 'function unloadItems() {', '/** Give the spare loot');
function host(o) {
  const logs = [], notes = [];
  const bag = o.bag.map(b => ({ Id: b.id, objId: b.objId, Name: b.name, Count: b.count || 1, IsEquiped: !!b.eq, IsQuestItem: false, EnchantLvl: b.enchant || 0, IsStackable: !!b.stack, Type: b.type || '' }));
  const gearItems = {}; o.bag.forEach(b => { if (b.gear) gearItems[b.id] = { n: b.name, s: 'head', g: b.grade }; });
  const env = {
    now: () => 1e12, num: (v) => Number(v) || 0, __SCRIPTS__: 'X:\\Scripts', SWARM_ROOT: 'X:', fileStamp: () => 'st1',
    File: { ReadAllText: () => JSON.stringify({ parties: o.rules }) }, logError: (w, e) => { throw new Error(w + ': ' + (e && e.message)); },
    Inventory: { forEach: (f) => bag.forEach(f), Count: bag.length }, gearDb: () => ({ items: gearItems }),
    stashPlanMine: () => ({ deposit: o.deposit.map(b => ({ objId: b.objId, id: b.id, name: b.name, count: b.count || 1, stackable: !!b.stack })) }),
    hovNotrade: () => new Set(), itemCount: (id) => bag.filter(b => b.Id === id).reduce((a, b) => a + b.Count, 0), qeProtected: () => false,
    clanLeaderName: () => 'Dagger1', CONFIG: { leader: o.leader }, Me: { Name: o.me }, note: (m) => notes.push(m), appendShared: (f, t) => logs.push({ f, t }),
    myGear: () => ({}), upgradeGain: () => 0,
  };
  const keys = Object.keys(env);
  const api = new Function(...keys, PURE + HOST + UNLOAD + '\nreturn { lootRowsMine, hovLootGate, unloadItems, lootRule, lootRuleRaw };')(...keys.map(k => env[k]));
  return Object.assign(api, { logs, notes });
}
const BAG = [Object.assign({}, HELM, { enchant: 0 }), Object.assign({}, STEM, { stack: true }), Object.assign({}, FPA), Object.assign({}, ENCH, { stack: true }), { id: 57, objId: 700, name: 'Adena', count: 900000, stack: true }];
const DEPOSIT = [HELM, STEM, FPA];   // the warehouse plan: the helmet is "old gear nobody plans" -> deposit (that is how it reached Dagger1)
// the 2026-10-13 22:10 situation BEFORE (the old file format: no mode) — the helmet would go
let H = host({ bag: BAG, deposit: DEPOSIT, rules: { Spoiler6: { on: true, to: 'clanleader', enchant: true, adenaAbove: 0 } }, leader: 'Spoiler6', me: 'Spoiler6' });
let L0 = H.lootRowsMine(H.lootRule('Spoiler6'));
check(L0.rows.some(r => r.name === 'Sealed Moirai Helmet') && !L0.kept.length, 'replay with the OLD rule (no mode): the helmet would be handed (reproduces the owner\'s report)');
// AFTER: the owner's new file (mode grade, keep S / S80 / S84)
H = host({ bag: BAG, deposit: DEPOSIT, rules: { Spoiler6: OWNER }, leader: 'Spoiler6', me: 'Spoiler6' });
const L1 = H.lootRowsMine(H.lootRule('Spoiler6'));
check(!L1.rows.some(r => r.name === 'Sealed Moirai Helmet') && L1.rows.some(r => r.name === 'Stem') && L1.rows.some(r => r.name === 'Full Plate Armor') && L1.rows.some(r => r.name === ENCH.name), 'replay with the owner\'s rule: the helmet stays; Stem, Full Plate Armor and the enchant scrolls still go to Dagger1', L1.rows.map(r => r.name));
check(L1.kept.length === 1 && L1.kept[0].why === 'S80 gear — party rule: keep S-grade', 'lootRowsMine reports it as kept (for the leader\'s party-chat line)', L1.kept);
const keptLine = H.logs.find(l => /loot_kept\.log$/.test(l.f));
check(!!keptLine && /\t(\w+)\t(\w+)\tSealed Moirai Helmet\tS80 gear — party rule: keep S-grade\tloot to \w+\r\n$/ /* names are scrubbed in the public package */.test(keptLine.t), 'Logs/loot_kept.log line: time, character, party, item, why, where', keptLine && keptLine.t);
check(H.notes.some(m => m === '[loot] kept: Sealed Moirai Helmet (S80 gear — party rule: keep S-grade) — loot to Dagger1'), 'the note says "kept: Sealed Moirai Helmet (S80 gear — party rule: keep S-grade)"', H.notes);
H.lootRowsMine(H.lootRule('Spoiler6'));
check(H.logs.filter(l => /loot_kept\.log$/.test(l.f)).length === 1, 'the same kept item is logged once (not at every supply run)');
// public default: no entry -> lootRule null (the leader's loot step does not run)
H = host({ bag: BAG, deposit: DEPOSIT, rules: {}, leader: 'Spoiler6', me: 'Spoiler6' });
check(H.lootRule('Spoiler6') === null && H.lootRuleRaw('Spoiler6') === null, 'no entry for the party: lootRule = null -> the loot hand-over does not run (public default OFF)');
H = host({ bag: BAG, deposit: DEPOSIT, rules: { Spoiler6: { on: false, mode: 'grade' } }, leader: 'Spoiler6', me: 'Spoiler6' });
check(H.lootRule('Spoiler6') === null && !!H.lootRuleRaw('Spoiler6'), 'switched off: lootRule = null, the raw entry still exists (its never list protects the other hand-overs)');
// the always list adds an item the warehouse plan keeps (Mana Potion) — never worn ones
H = host({ bag: BAG.concat([Object.assign({}, MANA, { stack: true }), { id: 728, objId: 606, name: 'Mana Potion', count: 1, eq: true }]), deposit: DEPOSIT, rules: { Spoiler6: { on: true, mode: 'list', always: ['Mana Potion'] } }, leader: 'Spoiler6', me: 'Spoiler6' });
const L2 = H.lootRowsMine(H.lootRule('Spoiler6'));
check(eq(L2.rows.map(r => r.objId), [605]), 'mode list + always "Mana Potion": only the bag\'s Mana Potions go (the worn / the plan\'s rows stay)', L2.rows);
check(!H.logs.some(l => /loot_kept\.log$/.test(l.f)), 'mode list: the items it simply keeps are not logged one by one');
// hovLootGate at trade time
H = host({ bag: BAG, deposit: DEPOSIT, rules: { Spoiler6: OWNER }, leader: 'Spoiler6', me: 'Grumbar' });
const R0 = { give: [{ objId: 501, id: 15694, name: 'Sealed Moirai Helmet', count: 1 }, { objId: 601, id: 1864, name: 'Stem', count: 120, stack: true }, { adena: true, id: 57, objId: 700, count: 1000, name: '1000 adena' }], skip: [] };
const g1 = H.hovLootGate({ id: 'loot_spoiler6_k1', by: 'Spoiler6', receiver: 'Dagger1' }, JSON.parse(JSON.stringify(R0)));
check(eq(g1.give.map(x => x.objId), [601, 700]) && g1.skip.length === 1 && g1.skip[0].why === 'kept: S80 gear — party rule: keep S-grade', 'hovLootGate (loot order from an older plan): the helmet is taken out at trade time, Stem + adena go', g1);
const g2 = H.hovLootGate({ id: 'trade_x_1', by: 'dashboard', receiver: 'Dagger1' }, JSON.parse(JSON.stringify(R0)));
check(eq(g2, R0), 'hovLootGate: your own order (Trade page) is never filtered — that is how you decide');
H = host({ bag: BAG, deposit: DEPOSIT, rules: { Spoiler6: { on: false, never: ['L2Day'] } }, leader: 'Spoiler6', me: 'Grumbar' });
const g3 = H.hovLootGate({ id: 'letters_grumbar_z', receiver: 'Dagger1' }, { give: [{ objId: 603, id: 3875, name: 'L2Day - A', count: 4, stack: true }], skip: [] });
check(!g3.give.length && /never-give list/.test(g3.skip[0].why), 'hovLootGate (letters order): the never list keeps the letters, even with the loot hand-over off');
const g4 = H.hovLootGate({ id: 'loot_spoiler6_k2', by: 'Spoiler6', receiver: 'Dagger1' }, JSON.parse(JSON.stringify(R0)));
check(!g4.give.some(x => !x.adena), 'hovLootGate: a loot order whose rule was switched off meanwhile hands nothing (adena only by its own amount)', g4);
// unload (the leader's bag is full: spare loot to a teammate) keeps the S80 helmet with the finder
H = host({ bag: BAG, deposit: DEPOSIT, rules: { Spoiler6: OWNER }, leader: 'Spoiler6', me: 'Spoiler6' });
const U = H.unloadItems();
check(!U.some(u => /Moirai/.test(u.name)) && U.some(u => /^Stem/.test(u.name)), 'unloadItems: the S80 helmet stays with the leader, the Stem may go to a teammate', U.map(u => u.name));
H = host({ bag: BAG, deposit: DEPOSIT, rules: {}, leader: 'Spoiler6', me: 'Spoiler6' });
check(H.unloadItems().some(u => /Moirai/.test(u.name)), 'unloadItems without a loot rule: unchanged (everything spare may go)');

// ---- 4) the API on a scratch file
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lootrules-'));
const F = path.join(TMP, 'data', 'loot_rules.json'); fs.mkdirSync(path.dirname(F), { recursive: true }); fs.mkdirSync(path.join(TMP, 'logs'));
process.env.SWARM_LOOTRULES_FILE = F;
const A = require(path.join(ROOT, 'Dashboard', 'lootrules_api.js'));
const ctx = { ROOT, DATA: path.join(TMP, 'data'), LOGS: path.join(TMP, 'logs'), teamMap: () => ({ Spoiler6: 'Spoiler6', Grumbar: 'Spoiler6', Tank1: 'Tank1' }), reloadCfg: () => ({ accounts: [] }), mainLeader: 'Tank1', readJson: () => null, readStates: () => [] };
let I = A.info(ctx);
check(!I.exists && I.parties.length === 2 && I.parties.every(p => !p.has && /^Off/.test(p.summary)), 'API: no file = every party off ("Off — everyone keeps what it finds")', I.parties);
let r = A.post(ctx, { party: 'Spoiler6', values: { on: true, mode: 'grade', keepGrades: ['s', 'S80', 'S84'], keepEnchanted: false, keepSpecial: false } });
const f1 = JSON.parse(fs.readFileSync(F, 'utf8'));
check(r.code === 200 && eq(f1.parties.Spoiler6, { on: true, mode: 'grade', keepGrades: ['S', 'S80', 'S84'], keepEnchanted: false, keepSpecial: false }) && /LOOT RULES/.test(f1._about), 'API: a new entry is written (grades normalised) with the file\'s _about', f1.parties);
I = A.info(ctx);
check(/^Everything goes to/.test(I.parties.find(p => p.leader === 'Spoiler6').summary) && I.parties.find(p => p.leader === 'Tank1').has === false, 'API: info shows the plain sentence per party');
check(A.post(ctx, { party: 'Spoiler6', values: { mode: 'bogus' } }).code === 400 && A.post(ctx, { party: 'Spoiler6', values: { keepGrades: ['Z'] } }).code === 400 && A.post(ctx, { party: 'Spoiler6', values: { never: ['x'.repeat(61)] } }).code === 400
  && A.post(ctx, { party: 'Spoiler6', values: { to: 'bad name!' } }).code === 400 && A.post(ctx, { party: 'Spoiler6', values: { wat: 1 } }).code === 400 && A.post(ctx, { party: 'no good', values: {} }).code === 400, 'API: bad mode / grade / list entry / receiver / key / party are refused (400)');
// keep foreign keys
const fx = JSON.parse(fs.readFileSync(F, 'utf8')); fx.parties.Spoiler6.note = 'spoil pair'; fx.extra = { keep: 1 }; fs.writeFileSync(F, JSON.stringify(fx, null, 1));
const rev = A.readFile(ctx).rev;
r = A.post(ctx, { party: 'Spoiler6', values: { never: ['Moirai', '15694', 15694], always: ['Stem'], to: 'Grumbar' }, rev });
const f2 = JSON.parse(fs.readFileSync(F, 'utf8'));
check(r.code === 200 && f2.parties.Spoiler6.note === 'spoil pair' && f2.extra.keep === 1 && eq(f2.parties.Spoiler6.never, ['Moirai', 15694]) && f2.parties.Spoiler6.to === 'Grumbar' && f2.parties.Spoiler6.mode === 'grade', 'API: only the sent keys change; "note" and other file keys stay; lists cleaned', f2.parties.Spoiler6);
check(A.post(ctx, { party: 'Spoiler6', values: { on: false }, rev }).code === 409, 'API: a stale rev = 409 (changed meanwhile)');
r = A.post(ctx, { party: 'Spoiler6', values: { always: null } });
check(r.code === 200 && !('always' in JSON.parse(fs.readFileSync(F, 'utf8')).parties.Spoiler6), 'API: a key set to null is removed (= the default)');
r = A.post(ctx, { party: 'Spoiler6', values: null });
check(r.code === 200 && !JSON.parse(fs.readFileSync(F, 'utf8')).parties.Spoiler6, 'API: values null removes the whole entry (= off)');
check(fs.readdirSync(path.join(TMP, 'data', 'history')).filter(f => /^loot_rules_/.test(f)).length >= 3, 'API: every save keeps a history copy (Scripts/data/history/loot_rules_<time>.json)');
fs.writeFileSync(path.join(TMP, 'logs', 'loot_kept.log'), `2026-10-13T22:31:00.000Z\tHaldrek\tHaldrek\tSealed Moirai Helmet\tS80 gear — party rule: keep S-grade\tloot to Dagger1\r\n`);
check(A.info(ctx).kept[0].item === 'Sealed Moirai Helmet' && !!A.info(ctx).kept[0].party, 'API: the kept log is shown (newest first)');
fs.writeFileSync(F, '{ broken'); check(A.post(ctx, { party: 'Spoiler6', values: { on: true } }).code === 500, 'API: a broken file blocks saving (500) instead of overwriting it');
delete process.env.SWARM_LOOTRULES_FILE;
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }

// ---- 5) source / install checks
check((src.match(/hovLootGate\(o, hovResolve\(mine\.items/g) || []).length === 2, 'swarm.js: hovGive re-checks both resolves (start + trade time) with hovLootGate');
check(/lootKeepWhy\(lr, Object\.assign\(\{ id, name \}, lootItemInfo/.test(UNLOAD), 'swarm.js: unloadItems is gated');
check(/action === 'lootrows'[^\n]*kept: \(L\.kept/.test(src) && /kept by the finders \(party loot rule\)/.test(src), 'swarm.js: the lootrows step returns kept items and the leader says them in party chat');
const server = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), idx = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), ps = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8');
check(/require\('\.\/lootrules_api'\)\.handle\(req, res, url/.test(server), 'server.js: the /api/lootrules + /lootlogic.js hook');
check(/<script src="\/lootlogic\.js"><\/script>/.test(idx), 'index.html loads /lootlogic.js');
check(/secStorage\(\), secLoot\(\)/.test(ps) && /loot: '\/api\/lootrules'/.test(ps) && (/PRIVATE-START[\s\S]{0,200}!lootgive[\s\S]{0,200}PRIVATE-END/.test(ps) || !fs.existsSync(path.join(ROOT, 'docs', 'plan', 'tools', 'release_build.js'))) /* PKGSKIP: the public package has the owner-only part cut out */, 'partysettings.js: the Loot section after Storage, its source, the owner-only "Hand loot over now" inside PRIVATE markers');
check(/data-psopensec="loot"/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'storagepage.js'), 'utf8')), 'Storage page: "⚙ Loot settings" opens the party settings at Loot');
const live = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'loot_rules.json'), 'utf8')); } catch (e) { return null; } })();
if (live && fs.existsSync(path.join(ROOT, 'Dashboard', 'circuitpage.js'))) {   // the owner's install
  const P = live.parties || {}, sp5 = ['Spoiler2', 'Spoiler3', 'Spoiler4', 'Spoiler5', 'Spoiler6'];
  check(sp5.every(p => P[p] && P[p].on === true && P[p].mode === 'grade' && eq(P[p].keepGrades, ['S', 'S80', 'S84']) && P[p].to === 'clanleader'), 'owner file: the 5 spoil parties hand everything to the clan leader except S-grade+ gear (kept by the finder)');
  check(sp5.every(p => LL.lootKeepWhy(P[p], HELM, 'loot') === 'S80 gear — party rule: keep S-grade' && LL.lootKeepWhy(P[p], STEM, 'loot') === ''), 'owner file: the helmet stays, a material still goes');
} else check(true, 'public install: no owner file to check');
if (fs.existsSync(path.join(ROOT, 'docs', 'plan', 'tools', 'release_build.js'))) check(/'loot_rules\.json'/.test(fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'tools', 'release_build.js'), 'utf8')), 'release_build.js never ships loot_rules.json (public = no file = OFF)');

console.log(`\n${n - fails}/${n} checks passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
