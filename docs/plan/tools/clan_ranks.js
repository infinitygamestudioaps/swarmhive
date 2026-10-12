#!/usr/bin/env node
// CLAN NOBILITY RANKS data builder (user 2026-10-12: forum topic 429 "Clan Nobility Ranks based on clan level").
//   node docs/plan/tools/clan_ranks.js [--out <file>] [--check]
// Writes Scripts/data/clan_ranks.json (atomic tmp + rename, previous copy in Settings/backup/clan_ranks_<time>.json).
// --check = build and validate only, print a short report, write nothing.
//
// Inputs:
//   * GUIDE     forum topic 429 (Scrapyard, 2021-12-05): the chart is an IMAGE, transcribed cell by cell (table CHART_ROWS below)
//   * DATAPACK  L2J High Five: game core L2ClanMember.calculatePledgeClass / L2Clan / L2VillageMasterInstance / clientpackets + config
//               (Shagooh/l2j-server-game main, read 2026-10-12), datapack item conditions <player pledgeClass=...> (stats/items),
//               Scripts/data/clan_data.json (levels, member limits, clan skills; built 2026-10-07 from the same sources),
//               Dashboard/data/items.json (names + grades)
//   * LIVE      the L2Toggle village master "Increase clan level" page the bots saved (newest Logs/clan_page_levelup_*_2.html)
//   * INFERRED  everything marked so (retail behaviour, not enforced by L2J; L2Toggle not checked in game)
// The rank table itself lives in Dashboard/clanranks_logic.js (shared with the dashboard module and the test); this tool copies it in.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data'), LOGS = path.join(ROOT, 'Logs');
const LOGIC = require(path.join(ROOT, 'Dashboard', 'clanranks_logic.js'));
const args = process.argv.slice(2);
const OUT = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : path.join(DATA, 'clan_ranks.json');
const CHECK = args.includes('--check');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };

const GRADES = ['none', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
const SRC = {
  forum: 'https://community.lineage2toggle.com/index.php?/topic/429-clan-nobility-ranks-based-on-clan-level/ (Scrapyard, 2021-12-05, 1 post, no replies; chart = image 1010x290, sources named in the post: ign.com/wikis/lineage-ii/Player_Rankings, legacy-lineage2.com/Knowledge/clans.html)',
  calc: 'L2J game core L2ClanMember.calculatePledgeClass (github.com/Shagooh/l2j-server-game, main)',
  vm: 'L2J L2VillageMasterInstance (create_academy 5 / create_royal 6 / create_knight 7)',
  clan: 'L2J L2Clan (getMaxNrOfMembers, createAlly level 5, siege skills for the leader at the castle siege min level)',
  war: 'L2J RequestStartPledgeWar (clan level >= 3 AND members >= character.properties ClanMembersForWar = 15)',
  crest: 'L2J RequestSetPledgeCrest / RequestExSetPledgeCrestLarge (clan level >= 3)',
  auction: 'L2J L2AuctioneerInstance bid1 (clan level >= 2, AUCTION_ONLY_CLAN_LEVEL_2_HIGHER)',
  wh: 'L2J datapack handlers/bypasshandlers/ClanWarehouse.java (clan level 0 refused: ONLY_LEVEL_1_CLAN_OR_HIGHER_CAN_USE_WAREHOUSE)',
  mpcc: 'L2J RequestExAskJoinMPCC (command channel: clan leader of a clan level >= 5, or the Clan Imperium skill)',
  fort: 'L2J config fortsiege.properties SiegeClanMinLevel = 4',
  castle: 'L2J config siege.properties ClanMinLevel = 5',
  clanProps: 'L2J config clan.properties (CreateRoyalGuardCost 5000, CreateKnightUnitCost 10000, ReinforceKnightUnitCost 5000, ClanLevel6-11Cost/Requirement)',
  items: 'L2J datapack stats/items <cond><player pledgeClass=".."/> (ConditionPlayerPledgeClass: needs a clan; -1 = clan leader only, else pledgeClass >= value)',
  trees: 'L2J datapack skillTrees/pledgeSkillTree.xml + subPledgeSkillTree.xml (socialClass per clan skill; SkillTreesData parses it, RequestAcquireSkill / L2Clan.addSkillEffects do not check it)',
  clanData: 'Scripts/data/clan_data.json (2026-10-07)',
};

// GUIDE: the chart, transcribed from the image (row -> column -> cell text). Kept verbatim (incl. the double Vassal row); "Maquis" fixed to Marquis.
const CHART_ROWS = {
  'Vassal (a)': { '1-4': 'Clan member' },
  'Vassal (b)': { '1-4': 'Lvl 3 Clan Leader', 6: 'Academy', 7: 'Academy', 8: 'Academy', 9: 'Academy', 10: 'Academy', 11: 'Academy' },
  Heir: { '1-4': 'Lvl 3 Clan Leader', 5: 'Clan member', 6: 'Guard Member', 7: 'Knight Member' },
  Knight: { '1-4': 'Lvl 4 Clan Leader', 6: 'Clan member', 7: 'Guard Member', 8: 'Knight Member' },
  Elder: { 5: 'Clan Leader', 6: 'Guard Captain', 7: 'Clan member', 8: 'Guard Member', 9: 'Knight Member' },
  Baron: { '1-4': 'Noblesse (any clan level)', 6: 'Clan Leader', 7: 'Knight Commander', 8: 'Clan member', 9: 'Guard Member', 10: 'Knight Member' },
  Viscount: { 7: 'Guard Captain', 8: 'Knight Commander', 9: 'Clan member', 10: 'Guard Member', 11: 'Knight Member' },
  Count: { 7: 'Clan Leader', 8: 'Guard Captain', 9: 'Knight Commander', 10: 'Clan member', 11: 'Guard Member' },
  Marquis: { '1-4': 'Hero (any clan level)', 8: 'Clan Leader', 9: 'Guard Captain', 10: 'Knight Commander', 11: 'Clan member' },
  Duke: { 9: 'Clan Leader', 10: 'Guard Captain', 11: 'Knight Commander' },
  'Grand Duke': { 10: 'Clan Leader', 11: 'Guard Captain' },
  King: { '1-4': 'Clan leader owning castle', 11: 'Clan Leader ?' },
};

// DATAPACK: items with a pledgeClass condition (stats/items, grep 2026-10-12)
const RANK_ITEMS = [
  { pledgeClass: 1, label: 'Clan Oath set (D)', ids: [7850, 7851, 7852, 7853, 7854, 7855, 7856, 7857, 7858, 7859, 9821, 9822, 9823, 9827, 9828, 9829] },
  { pledgeClass: 2, label: 'Castle circlets', ids: [6834, 6835, 6836, 6837, 6838, 6839, 6840, 8182, 8183] },
  { pledgeClass: 4, label: 'Apella sets (A)', ids: [7860, 7861, 7862, 7863, 7864, 7865, 7866, 7867, 7868, 7869, 7870, 7871, 7872, 7873, 7874, 7875, 7876, 7877, 7878, 7879, 14582, 14583, 14584, 14585, 14586, 14587, 14588, 14589, 14590, 14591] },
  { pledgeClass: 5, label: "Improved Apella (A) + Knight's Cloak", ids: [9830, 9831, 9832, 9833, 9834, 9835, 9836, 9837, 9838, 9839, 13686, 13687, 13688, 13689, 13690] },
  { pledgeClass: -1, label: "The Lord's Crown", ids: [6841] },
];

// DATAPACK features per clan level (what a level opens apart from member limits, ranks and clan skills)
const FEATURES = {
  1: [{ what: 'Clan warehouse', src: SRC.wh }],
  2: [{ what: 'Bid in clan hall auctions', src: SRC.auction }],
  3: [{ what: 'Clan crest + large crest', src: SRC.crest }, { what: 'Declare clan wars (also needs 15+ members)', src: SRC.war }],
  4: [{ what: 'Register for fortress sieges', src: SRC.fort }, { what: 'Leader becomes Knight; other members drop to Vagabond in L2J (quirk, see conflicts)', src: SRC.calc }],
  5: [{ what: 'Create an alliance', src: SRC.clan }, { what: 'Clan leader can open a Command Channel', src: SRC.mpcc }, { what: 'Register for castle sieges; the leader gets the siege skills', src: SRC.castle + '; ' + SRC.clan },
    { what: 'Clan Academy (20 members, free)', src: SRC.vm }, { what: 'Clan skills can be learned (clan reputation + items)', src: SRC.trees }, { what: "Clan reputation quests 508 A Clan's Reputation, 510 A Clan's Prestige", src: SRC.clanData }],
  6: [{ what: 'Royal Guard x2 (5,000 reputation each, 20 members each)', src: SRC.vm + '; ' + SRC.clanProps }, { what: "Clan quest 509 A Clan's Fame", src: SRC.clanData }],
  7: [{ what: 'Order of Knights x4 (10,000 reputation each, 10 members each)', src: SRC.vm + '; ' + SRC.clanProps }, { what: 'Squad skills (one sub-unit each)', src: SRC.trees }],
  9: [{ what: 'Order of Knights limit 25 each', src: SRC.clan }],
  11: [{ what: 'Royal Guard limit 30 each', src: SRC.clan }],
};

const CONFLICTS = [
  { where: 'clan level 1-3, leader', chart: 'Vassal and Heir (listed in both rows for a level-3 leader)', l2j: 'Vassal (1)', use: 'L2J' },
  { where: 'clan level 4, non-leaders', chart: 'Vassal (1)', l2j: 'Vagabond (0) — calculatePledgeClass has no else-branch for level 4', use: 'L2J (probable L2J quirk; matters only for Clan Oath gear: a level-4 member could lose it)' },
  { where: 'Academy', chart: 'starts at clan level 6 (Vassal)', l2j: 'created from clan level 5; a level-5 academy member gets Heir (2) because case 5 ignores the pledge type', use: 'L2J' },
  { where: 'King', chart: 'clan leader owning a castle = King (any level); level 11 leader "Clan Leader ?"', l2j: 'no castle rule; every level-11 leader = 11', use: 'L2J (castle rule kept as GUIDE override only)' },
  { where: 'clan skill ranks (minRank / socialClass)', chart: '-', l2j: 'parsed and shown in the skill list only; L2Clan.addSkillEffects checks skill.minPledgeClass, which is 0 for clan skills -> every member gets every clan skill', use: 'retail = INFERRED; L2Toggle not checked' },
  { where: 'spelling', chart: '"Maquis"', l2j: 'Marquis', use: 'Marquis' },
];

function liveLevelPage() {
  let best = null;
  try {
    fs.readdirSync(LOGS).filter(f => /^clan_page_levelup_.+_\d+\.html$/.test(f)).forEach(f => {
      const t = fs.readFileSync(path.join(LOGS, f), 'utf8');
      if (!/Raising clan level requires/i.test(t)) return;
      const m = fs.statSync(path.join(LOGS, f)).mtimeMs;
      if (!best || m > best.m) best = { f, t, m };
    });
  } catch (e) { }
  if (!best) return null;
  const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const levels = {};
  const re = /Level (\d+)<\/font>\s*-\s*([\s\S]*?)(?=<br|$)/g; let m;
  while ((m = re.exec(best.t))) levels[m[1]] = strip(m[2]);
  const hints = [];
  const hr = /You can obtain a[\s\S]*?(?=<br>)|To obtain an?[\s\S]*?(?=<br>)/g; let h;
  while ((h = hr.exec(best.t))) hints.push(strip(h[0]));
  return { file: 'Logs/' + best.f, savedAt: new Date(best.m).toISOString(), levels, hints };
}

function build() {
  const cd = rd(path.join(DATA, 'clan_data.json'), null);
  if (!cd || !Array.isArray(cd.levels)) throw new Error('Scripts/data/clan_data.json missing or without levels');
  const itemsDb = rd(path.join(ROOT, 'Dashboard', 'data', 'items.json'), {});
  const itemOf = (id) => { const x = Array.isArray(itemsDb) ? itemsDb.find(i => i.id == id) : itemsDb[id]; if (!x) return { id, name: '#' + id, grade: '?' };
    const a = Array.isArray(x) ? x : [x.name, x.icon, x.type, x.grade]; return { id, name: a[0], grade: GRADES[Number(a[3])] || (a[3] === '' || a[3] == null ? '-' : String(a[3])) }; };
  const live = liveLevelPage();
  const prev = rd(OUT, {}) || {};

  const levels = cd.levels.map(L => {
    const lv = Number(L.level), lim = L.memberLimitAfter || {};
    const skills = (cd.skills || []).filter(s => Number(s.clanLevel) === lv);
    const ranks = {}; LOGIC.ROLES.forEach(r => { const pc = LOGIC.l2jBase(lv, r); if (pc != null) ranks[r] = { pc, rank: LOGIC.rankName(pc) }; });
    const liveText = live && live.levels[String(lv)] || null;
    const nums = [L.sp, L.adena, L.reputation, L.members].filter(n => Number(n) > 0).map(n => Number(n).toLocaleString('en-US'));
    const liveMatches = liveText ? nums.every(n => liveText.replace(/\s/g, '').includes(n.replace(/\s/g, ''))) && (L.items || []).every(it => liveText.toLowerCase().includes(String(it.name).toLowerCase().replace(/s$/, '').slice(0, 10))) : null;
    let itemSource = L.itemSource || null;
    if (lv === 3 && live) { const hint = live.hints.find(x => /Blood Mark/i.test(x)); if (hint) itemSource = `LIVE (village master page): ${hint}`; }
    return {
      level: lv,
      requirements: { sp: Number(L.sp) || 0, adena: Number(L.adena) || 0, items: L.items || [], reputation: Number(L.reputation) || 0, members: Number(L.members) || 0,
        extra: lv === 11 ? 'The clan must own a territory (LIVE page: "Must be Territory Owner")' : null, paidBy: lv <= 5 ? 'clan leader (SP, adena, item)' : 'the clan (reputation)', tag: 'DATAPACK',
        membersRule: Number(L.members) ? 'L2J L2Clan.levelUpClan: getMembersCount() >= N (academy + sub-units count); the LIVE page says "More than N" (exact edge not verified)' : null },
      itemSource,
      live: liveText ? { text: liveText, matchesDatapack: liveMatches } : null,
      unlocks: {
        memberLimit: { main: lim.main, academy: lim.academy || 0, royalGuardsEach: lim.royalGuardsEach || 0, knightsEach: lim.knightsEach || 0, tag: 'DATAPACK' },
        features: (FEATURES[lv] || []).map(f => ({ what: f.what, source: f.src, tag: 'DATAPACK' })),
        clanSkills: skills.filter(s => s.kind === 'clan').map(s => `${s.name} ${s.level}`),
        squadSkills: skills.filter(s => s.kind === 'squad').map(s => `${s.name} ${s.level}`),
        residenceSkills: skills.filter(s => s.kind === 'residential').length,
        ranks,
      },
    };
  });

  const byClanLevel = {};
  LOGIC.ladder().forEach(row => {
    const l2j = {}, chart = {}, diff = [];
    Object.entries(row.cells).forEach(([r, c]) => { if (c.l2j != null) l2j[r] = c.l2j; if (c.chart != null) chart[r] = c.chart; if (c.differs) diff.push(r); });
    byClanLevel[row.level] = { l2j, chart, differs: diff };
  });

  const rankGatedItems = RANK_ITEMS.map(g => ({ pledgeClass: g.pledgeClass, rank: g.pledgeClass === -1 ? 'Clan leader only' : LOGIC.rankName(g.pledgeClass), label: g.label,
    items: g.ids.map(itemOf), leaderFromClanLevel: g.pledgeClass === -1 ? 0 : LOGIC.firstLevelFor('leader', g.pledgeClass),
    memberFromClanLevel: g.pledgeClass === -1 ? null : LOGIC.firstLevelFor('member', g.pledgeClass), noblesseIsEnough: g.pledgeClass !== -1 && g.pledgeClass <= 5, tag: 'DATAPACK' }));

  const STOP = { APPRENTICE: 1, HEIR: 2, KNIGHT: 3, ELDER: 4, BARON: 5, VISCOUNT: 6 };
  const clanSkillRanks = {};
  (cd.skills || []).filter(s => s.kind === 'clan' || s.kind === 'squad').forEach(s => {
    const k = `${s.id} ${s.name}`; if (clanSkillRanks[k]) return;
    clanSkillRanks[k] = { socialClass: s.minRank, retailMinRank: LOGIC.rankName(STOP[s.minRank]), retailMinPledgeClass: STOP[s.minRank] != null ? STOP[s.minRank] : null, kind: s.kind };
  });

  return {
    _readme: 'Clan nobility ranks (built by docs/plan/tools/clan_ranks.js — do not edit by hand, except characterFlags). Tags: GUIDE = forum topic 429 chart, DATAPACK = L2J High Five code/data, LIVE = the L2Toggle village master page saved by the bots, INFERRED = retail behaviour not enforced by L2J / not seen on L2Toggle. Dashboard: Dashboard/clanranks.js (+ _logic, _api, .css).',
    generated: new Date().toISOString(),
    sources: SRC,
    rankIds: LOGIC.RANK_NAMES.map((n, i) => ({ id: i, name: n, note: i === 11 ? 'L2J client name "Distinguished King"; chart "King"' : i === 0 ? 'only via the level-4 L2J quirk or without a clan' : '' })),
    socialClassEnum: { tag: 'DATAPACK', list: ['VAGABOND', 'VASSAL', 'APPRENTICE', 'HEIR', 'KNIGHT', 'ELDER', 'BARON', 'VISCOUNT', 'COUNT', 'MARQUIS', 'DUKE', 'GRAND_DUKE', 'DISTINGUISHED_KING', 'EMPEROR'],
      note: 'skill-tree enum: APPRENTICE is inserted at ordinal 2, so ordinals from HEIR up are one higher than pledgeClass. Mapping by NAME: HEIR 2, KNIGHT 3, ELDER 4, BARON 5, VISCOUNT 6; APPRENTICE -> 1 (Vassal) is INFERRED.' },
    roles: Object.fromEntries(LOGIC.ROLES.map(r => [r, { label: LOGIC.ROLE_LABEL[r], fromClanLevel: LOGIC.UNIT_MIN_LEVEL[r] || 1 }])),
    overrides: { noblesse: { minPledgeClass: 5, tag: 'GUIDE + DATAPACK' }, hero: { minPledgeClass: 8, tag: 'GUIDE + DATAPACK' }, castleOwnerLeader: { pledgeClass: 11, tag: 'GUIDE only (not in L2J)' } },
    chart: { tag: 'GUIDE', columns: ['1-4', '5', '6', '7', '8', '9', '10', '11'], header: 'Clan member means direct clan member, not a member within a Royal guard, Order of the Knights, or Academy', rows: CHART_ROWS },
    byClanLevel,
    conflicts: CONFLICTS,
    levels,
    live: live ? { file: live.file, savedAt: live.savedAt, hints: live.hints, tag: 'LIVE' } : null,
    rankGatedItems,
    rankGatedSkills: [{ id: 3603, name: 'Demon Sword Zariche (cursed weapon)', minPledgeClass: 2, tag: 'DATAPACK' }, { id: 3629, name: 'Blood Sword Akamanah (cursed weapon)', minPledgeClass: 2, tag: 'DATAPACK' }],
    clanSkillRanks: { tag: 'INFERRED', note: 'retail: lowest member rank that receives the clan skill passive. L2J does NOT enforce it (every member gets every clan skill); L2Toggle not checked.', skills: clanSkillRanks },
    l2toggleNotes: [
      { what: 'Member limit at clan level 2', text: 'CLAUDE.md 6b (2026-10-10) calls MyClan level 2 "FULL (13 + leader limit)" with 13 members; the L2J default is 20. Not verified on L2Toggle.', tag: 'INFERRED' },
      { what: 'Clan level costs', text: live ? `LIVE page ${live.file} lists the same SP / adena / items / reputation / member counts as L2J (see levels[].live.matchesDatapack).` : 'no LIVE page saved yet', tag: live ? 'LIVE' : 'INFERRED' },
      { what: 'Ranks on L2Toggle', text: 'Not seen in game. The bots do not read pledgeClass (no field in the L2Swarm JS API docs).', tag: 'INFERRED' },
    ],
    characterFlags: prev.characterFlags && typeof prev.characterFlags === 'object' ? prev.characterFlags : {},
    _characterFlagsHelp: 'Optional { "<Name>": { "noble": true, "hero": true } } — kept when the tool rebuilds the file. Nobody is Noblesse / Hero today (INFERRED: Noblesse needs a level-75 subclass; highest character is 58).',
  };
}

function validate(d) {
  const errs = [];
  if (!d.levels || d.levels.length !== 11) errs.push('levels: expected 11 clan levels');
  for (let l = 5; l <= 11; l++) if ((d.byClanLevel[l].differs || []).some(r => r !== 'academy' || l !== 5)) errs.push(`chart vs L2J differs at clan level ${l}: ${d.byClanLevel[l].differs}`);
  if (d.byClanLevel[8].l2j.member !== 5) errs.push('level 8 main member should be Baron (5)');
  // item names come from Dashboard/data/items.json (generated by SETUP -Images): without it every item is "#id", which is not an error
  if (fs.existsSync(path.join(ROOT, 'Dashboard', 'data', 'items.json'))) d.rankGatedItems.forEach(g => g.items.forEach(it => { if (/^#/.test(it.name)) errs.push('unknown item ' + it.id); }));
  return errs;
}

function writeAtomic(F, obj) {
  if (fs.existsSync(F)) { try { const B = path.join(ROOT, 'Settings', 'backup'); fs.mkdirSync(B, { recursive: true }); fs.copyFileSync(F, path.join(B, `clan_ranks_${Date.now()}.json`)); } catch (e) { } }
  const tmp = F + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 1)); fs.renameSync(tmp, F);
}

if (require.main === module) {
  const d = build(), errs = validate(d);
  console.log(`clan_ranks: ${d.levels.length} levels, ${d.rankGatedItems.length} rank item groups, ${Object.keys(d.clanSkillRanks.skills).length} clan/squad skills, live page: ${d.live ? d.live.file : 'none'}`);
  d.levels.forEach(l => { if (l.live) console.log(`  level ${l.level}: live "${l.live.text}" matches datapack: ${l.live.matchesDatapack}`); });
  if (errs.length) { console.error('VALIDATION FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
  if (CHECK) { console.log('check only, nothing written'); process.exit(0); }
  writeAtomic(OUT, d); console.log('written ' + OUT);
}
module.exports = { build, validate, CHART_ROWS, RANK_ITEMS, FEATURES, CONFLICTS };
