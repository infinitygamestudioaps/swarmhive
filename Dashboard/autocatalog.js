// AUTOMATIONS CATALOG (Discord player Roketta 2026-10-15: "one page that lists everything SwarmHive can do by itself, per party, whether it is on
// or off right now and why"). ONE list for the page (window.AutoCatalog, Dashboard/autooverview.js), the API (Dashboard/autooverview_api.js
// evaluates every entry per party from the real switch files) and the test (docs/plan/tools/test_auto_overview.js fails when swarm.js has a
// runAuto(kind) / RUN_ALWAYS kind, Dashboard/partyauto_api.js a KINDS key or Dashboard/clanauto_api.js a switch that no entry here covers).
//
// A NEW AUTOMATION = one entry here (+ an evaluator in autooverview_api.js EVAL when it has its own switch). Fields:
//   key      unique id                         group   one of GROUPS (the page's sections, in this order)
//   title    short name (plain words)          what    ONE plain sentence: what it does by itself
//   gate     'always'  runs whatever the switches say (survival, your orders)
//            'start'   needs the party's Start switch (run_state.json) AND its own switch (if it has one)
//            'switch'  only its own switch (works while the party is stopped too)
//            'order'   only when you order it (and, if noted, while the party is started)
//            'manual'  never automatic
//   def      what a new install has: 'on' | 'off' | 'always' | 'order' | 'manual'
//   switch   where the switch is, in plain words (shown as "Switch: …")
//   where    the button: { label, settings: <party settings section> } | { label, hash: '#/…' (':leader' = the party) } | { label, card: true }
//   eval     which evaluator of autooverview_api.js reads its switch (missing = no own switch)
//   kinds    swarm.js runAuto('<kind>') / RUN_ALWAYS kinds this entry stands for
//   pauto    Dashboard/partyauto_api.js KINDS keys        clan   Dashboard/clanauto_api.js switch keys
//   scope    'party' (default) | 'clan' (one switch for the whole clan)
// OWNER-ONLY entries sit between PRIVATE-START / PRIVATE-END (release_build.js cuts them out of the public package).
(function (root) {
  'use strict';
  const GROUPS = [
    { key: 'master', title: 'The master switch' },
    { key: 'survival', title: 'Survival — always on' },
    { key: 'fight', title: 'Fighting' },
    { key: 'level', title: 'Leveling and moving' },
    { key: 'supply', title: 'Supplies and money' },
    { key: 'storage', title: 'Storage and loot' },
    { key: 'gear', title: 'Gear and class' },
    { key: 'daily', title: 'Daily and events' },
    { key: 'clan', title: 'Clan (one switch for the whole clan)' },
  ];
  const E = [
    // ------------------------------------------------------------------------------------------------ master
    { key: 'start', group: 'master', title: 'Party Start / Stop', gate: 'switch', def: 'off', eval: 'run',
      what: 'The main switch of a party: while it is stopped the party does nothing on its own — survival, trades and your orders still work.',
      switch: 'the ▶ Start / ■ Stop button on the party card', where: { label: 'Party card', card: true } },
    // ------------------------------------------------------------------------------------------------ survival
    { key: 'survive', group: 'survival', title: 'Stay alive', gate: 'always', def: 'always', kinds: ['survive', 'respawn', 'defend', 'rescue', 'escape'],
      what: 'Heals itself, fights back when attacked, helps a teammate under attack, runs from a fight it cannot win and goes back to town after a death.',
      switch: 'none — always on' },
    { key: 'unstuck', group: 'survival', title: 'Get unstuck', gate: 'always', def: 'always', kinds: ['appearing', 'unfreeze'],
      what: 'Fixes a frozen character after a teleport, wiggles free from walls and uses the free .town command when it is really stuck.',
      switch: 'none — always on' },
    { key: 'orders', group: 'survival', title: 'Your orders and trades', gate: 'always', def: 'always', kinds: ['order', 'trade'],
      what: 'Whatever you order on the dashboard (or in party chat) and every trade always runs, even when the party is stopped.',
      switch: 'none — always on' },
    { key: 'res', group: 'survival', title: 'Resurrect the dead', gate: 'switch', def: 'on', eval: 'res', kinds: ['res'],
      what: 'A teammate with a resurrection skill or scroll walks to a dead member and raises it; the raised one rebuffs first.',
      switch: 'party Settings → Resurrection', where: { label: 'Resurrection settings', settings: 'res' } },
    // ------------------------------------------------------------------------------------------------ fighting
    { key: 'skills', group: 'fight', title: 'Hive picks the skills', gate: 'switch', def: 'on', eval: 'pauto', pauto: ['skills'],
      what: 'Chooses and casts attacks, area attacks, debuffs, buffs, songs, dances and toggles; off = your own L2Swarm profile fights.',
      switch: 'party Settings → Combat', where: { label: 'Combat settings', settings: 'combat' } },
    { key: 'heals', group: 'fight', title: 'Hive heals', gate: 'switch', def: 'on', eval: 'pauto', pauto: ['heals'],
      what: 'Heals the party (group heals, cures, Recharge); off = your own L2Swarm profile heals.',
      switch: 'party Settings → Combat', where: { label: 'Combat settings', settings: 'combat' } },
    { key: 'potions', group: 'fight', title: 'Hive drinks potions', gate: 'switch', def: 'on', eval: 'pauto', pauto: ['potions'],
      what: 'Drinks Healing and Mana Potions when HP or MP run low.',
      switch: 'party Settings → Combat', where: { label: 'Combat settings', settings: 'combat' } },
    { key: 'swarmFight', group: 'fight', title: 'Fight with L2Swarm', gate: 'switch', def: 'off', eval: 'pauto', pauto: ['swarmFight'],   // SWARMFIGHT-2026-10-16
      what: 'At the hunting spot your L2Swarm profiles do the fighting (combat zone, Follow and Follow Attack) while Hive only travels, restocks and gears up.',
      switch: 'party Settings → Combat', where: { label: 'Combat settings', settings: 'combat' } },
    { key: 'recommend', group: 'fight', title: 'Recommend each other', gate: 'switch', def: 'off', eval: 'pauto', pauto: ['recommend'],   // RECOMMEND-2026-10-23
      what: 'Once a minute, out of combat, each character recommends the teammate near it with the fewest recommendations, up to 255.',
      switch: 'party Settings → Combat', where: { label: 'Combat settings', settings: 'combat' } },
    { key: 'spotLevelCheck', group: 'level', title: 'Ask before a spot above our level', gate: 'switch', def: 'off', eval: 'pauto', pauto: ['spotLevelCheck'],   // SPOTCHOICE-2026-10-23
      what: 'When on, the party waits for your OK before hunting a spot you chose above its level; off (the default) it goes there and warns in party chat.',
      switch: 'party Settings → Combat', where: { label: 'Combat settings', settings: 'combat' } },
    { key: 'healplan', group: 'fight', title: 'Heal choices', gate: 'always', def: 'always', eval: 'heal',
      what: 'Which heal at which HP, who is healed first and when to use Recharge — automatic until you change it per character.',
      switch: 'party Settings → Healing', where: { label: 'Healing settings', settings: 'heal' } },
    { key: 'buffs', group: 'fight', title: 'Own buffs, songs and dances', gate: 'always', def: 'always', eval: 'buffs',
      what: 'Buffers keep their own buffs, songs and dances up on the party — the built-in choice, or your buff plan.',
      switch: 'Buffs page (a plan per party)', where: { label: 'Buffs page', hash: '#/buffs/:leader' } },
    { key: 'tactics', group: 'fight', title: 'Hunting pairs', gate: 'switch', def: 'off', eval: 'tactics',
      what: 'While leveling, the damage dealers split into small groups that each take their own monster, then go back to focus fire when it gets dangerous.',
      switch: 'party Settings → Fighting', where: { label: 'Fighting settings', settings: 'fight' } },
    // ------------------------------------------------------------------------------------------------ leveling / moving
    { key: 'leveling', group: 'level', title: 'Leveling', gate: 'start', def: 'off', eval: 'leveling',
      kinds: ['leveling', 'watchdog', 'watchdog leveling', 'resume', 'leveling after an automatic pause'],
      what: 'Hunts at the spot you chose (or picks one for the party\'s level) and starts again by itself after an idle pause or a restart.',
      switch: 'Start on the party card (+ the hunting spot: Choose…)', where: { label: 'Party card', card: true } },
    { key: 'hunttimer', group: 'level', title: 'Hunting timer', gate: 'start', def: 'off', eval: 'hunttimer',
      what: 'Hunts a chosen spot for the hours you picked, then goes to town, resupplies and comes back, or keeps hunting — as you chose.',
      switch: 'asked when you choose a hunting spot (party card)', where: { label: 'Party card', card: true } },
    { key: 'regroup', group: 'level', title: 'Keep the party together', gate: 'start', def: 'off',
      kinds: ['left-behind trip', 'split regroup', 'back-to-the-middle walk'],
      what: 'Fetches members who were left behind, regroups in Giran after a split and walks strays back to the leader.',
      switch: 'Start on the party card', where: { label: 'Party card', card: true } },
    { key: 'plan', group: 'level', title: 'Party plan', gate: 'start', def: 'off', eval: 'plan',
      what: 'Runs your plan step by step (level to N, quest, class change, town, supplies, raid, wait for you) when you press Start.',
      switch: '📋 Plan on the party card ("Use this plan when I press Start")', where: { label: 'Plan', settings: 'plan' } },
    { key: 'routes', group: 'level', title: 'Route rules', gate: 'always', def: 'always', eval: 'routes',
      what: 'What the party may do on a long walk: doors, swimming, drops, moving together, walking out of Heine, buying keys.',
      switch: 'party Settings → Routes', where: { label: 'Route settings', settings: 'routes' } },
    { key: 'raidhunt', group: 'level', title: 'Raid hunt', gate: 'order', def: 'order', eval: 'raidhunt', kinds: ['raidhunt'],
      what: 'Goes from raid boss to raid boss that fits the party\'s level — only after you order it, and only while the party is started.',
      switch: 'your order (Commands → Raid hunt)', where: { label: 'Raid bosses', hash: '#/raids' } },
    { key: 'questfarm', group: 'level', title: 'Quest farm', gate: 'start', def: 'off', eval: 'questfarm',
      what: 'Chosen characters repeat the planned money quests for their level by themselves.',
      switch: 'Quests page → Quest farm', where: { label: 'Quests page', hash: '#/quests' } },
    // ------------------------------------------------------------------------------------------------ supplies / money
    { key: 'supplyWatch', group: 'supply', title: 'Supply runs', gate: 'start', def: 'off', eval: 'pauto', pauto: ['supplyWatch'], kinds: ['supply run'],
      what: 'When someone runs low on scrolls, shots or potions (or a bag is full) the leader goes to Giran, buys for everyone and hands it out; off = nothing is bought by itself, also not when shots run out (they fight on without shots and you get a warning).',   // ONESWITCH-2026-10-27
      switch: 'party Settings → Supplies', where: { label: 'Supplies settings', settings: 'supplies' } },
    { key: 'sell', group: 'supply', title: 'Sell marked items', gate: 'start', def: 'off', eval: 'pauto', pauto: ['sell'], kinds: ['town sell'],
      what: 'Sells only the items you marked "sell" on town visits and during supply runs (gear is never sold as junk; off unless you switch it on).',
      switch: 'party Settings → Supplies', where: { label: 'Supplies settings', settings: 'supplies' } },
    { key: 'dyes', group: 'supply', title: 'Draw symbols (dyes)', gate: 'start', def: 'off', eval: 'pauto', pauto: ['dyes'],
      what: 'During supply runs each character with a symbol plan buys the dyes and draws its next symbol in Giran.',
      switch: 'party Settings → Supplies', where: { label: 'Supplies settings', settings: 'supplies' } },
    { key: 'storeMagnus', group: 'supply', title: "Magnus' Chant from a buff store", gate: 'start', def: 'off', eval: 'pauto', pauto: ['storeMagnus'],   // MAGNUS-2026-10-23
      what: "In supply runs and Giran rebuffs the leader buys Magnus' Chant (Chant of Magus: casting speed) for the whole party from a player buff store.",
      switch: 'party Settings → Supplies', where: { label: 'Supplies settings', settings: 'supplies' } },
    { key: 'storeCov', group: 'supply', title: 'Chant of Victory from a buff store', gate: 'start', def: 'off', eval: 'pauto', pauto: ['storeCov'],   // BUFFSTORE-2026-10-19
      what: 'At the end of a supply run in Giran the leader buys Chant of Victory for the whole party from a player buff store, when it is cheap and running out.',
      switch: 'party Settings → Supplies', where: { label: 'Supplies settings', settings: 'supplies' } },
    { key: 'vitality', group: 'supply', title: 'Gift of Vitality', gate: 'start', def: 'off', eval: 'pauto', pauto: ['vitality'],   // VITALITY-2026-10-21
      what: 'In a supply run in Giran every character below vitality level 4 takes the free Gift of Vitality from the high priest next to the temple (at most once every 5 hours).',
      switch: 'party Settings → Supplies', where: { label: 'Supplies settings', settings: 'supplies' } },
    { key: 'unload', group: 'supply', title: 'Spare loot to a teammate', gate: 'start', def: 'off', eval: 'pauto', pauto: ['unload'],   // UNLOADGATE-2026-10-16
      what: 'In a supply run, when the leader carries more than 150 kinds of items, he trades what he does not use to the teammate with the most free slots (never potions, shots, scrolls, arrows, letters or items marked for selling).',
      switch: 'party Settings → Supplies', where: { label: 'Supplies settings', settings: 'supplies' } },
    { key: 'dpScrolls', group: 'supply', title: 'Death Penalty scrolls', gate: 'start', def: 'on', eval: 'pauto', pauto: ['dpScrolls'],   // RESUPOPT-2026-10-27
      what: 'In Giran (regroup, rebuff trip) every character with a Death Penalty or few Recovery scrolls buys and reads them at Helvetia, and a team with a penalty and no scrolls makes that trip; off = none bought by itself.',
      switch: 'party Settings → Supplies', where: { label: 'Supplies settings', settings: 'supplies' } },
    { key: 'missionSupplies', group: 'supply', title: 'Mission supplies', gate: 'start', def: 'on', eval: 'pauto', pauto: ['missionSupplies'],   // RESUPOPT-2026-10-27
      what: 'Before an automatic raid (raid hunt) or the daily Kamaloka every character tops up its extra potions (and the tank Spirit Ore) at the grocer; off = they go without, your own mission orders still buy.',
      switch: 'party Settings → Supplies', where: { label: 'Supplies settings', settings: 'supplies' } },
    { key: 'pshop', group: 'supply', title: 'Shots from player shops', gate: 'start', def: 'off', eval: 'pshop',
      what: 'During supply runs the leader buys B / A / S grade shots from player shops in Giran, within your price and budget.',
      switch: 'party Settings → Supplies', where: { label: 'Supplies settings', settings: 'supplies' } },
    { key: 'fund', group: 'supply', title: 'Adena hand-outs', gate: 'start', def: 'off', eval: 'fund',
      what: 'Rich characters top up the adena of poor ones (also across parties) in town, as set on the Adena page.',
      switch: 'Adena page (on / givers) + party Settings → Money', where: { label: 'Money settings', settings: 'money' } },
    // ------------------------------------------------------------------------------------------------ storage / loot
    { key: 'stash', group: 'storage', title: 'Store in the warehouse', gate: 'start', def: 'off', eval: 'stash', kinds: ['warehouse stash'],
      what: 'When the bag gets full (or as you set) the character stores items in the clan or its own warehouse while idle in town.',
      switch: 'Storage page (or party Settings → Storage)', where: { label: 'Storage settings', settings: 'storage' } },
    { key: 'letters', group: 'storage', title: 'Hand in event letters', gate: 'start', def: 'off', eval: 'letters',
      what: 'Every character hands its event letters to one receiver when both are idle in the same town.',
      switch: 'Storage page → Letters', where: { label: 'Storage page', hash: '#/storage' } },
    { key: 'collector', group: 'storage', title: 'Collector', gate: 'switch', def: 'off', eval: 'collector',
      what: 'One character stays in town and does the storing, selling and hand-outs for everyone, even while its party is stopped.',
      switch: 'Storage page → Collector', where: { label: 'Storage page', hash: '#/storage' } },
    { key: 'loot', group: 'storage', title: 'Hand loot to a collector', gate: 'start', def: 'off', eval: 'loot',
      what: 'The party hands what it finds to the clan leader or a chosen character during supply runs, as your loot rules say.',
      switch: 'party Settings → Loot', where: { label: 'Loot settings', settings: 'loot' } },
    // ------------------------------------------------------------------------------------------------ gear / class
    { key: 'gear', group: 'gear', title: 'Buy gear upgrades', gate: 'switch', def: 'off', eval: 'gear',
      what: 'Buys better gear for the character\'s level in Giran during supply runs and equips it.',
      switch: 'party Settings → Gear (or the Gear page)', where: { label: 'Gear settings', settings: 'gear' } },
    { key: 'classchange', group: 'gear', title: 'Class change', gate: 'start', def: 'off', eval: 'classplan', kinds: ['class change'],
      what: 'Changes class at level 20 / 40 / 76 — only along a class plan you approved.',
      switch: 'Classes page (approve a plan per character)', where: { label: 'Classes page', hash: '#/classes/:leader' } },
    { key: 'soul', group: 'gear', title: 'Level soul crystals', gate: 'always', def: 'always', eval: 'soul',
      what: 'A character carrying a soul crystal levels it on the right monsters while hunting (colour per character; "off" = never).',
      switch: 'Crystals tab', where: { label: 'Crystals tab', hash: '#/crystals' } },
    { key: 'enchant', group: 'gear', title: 'Enchanting', gate: 'manual', def: 'manual',
      what: 'Never automatic: enchanting gear is always your own order.',
      switch: 'none — your order only (Enchant / !enchant)' },
    // ------------------------------------------------------------------------------------------------ daily / events
    { key: 'kamaloka', group: 'daily', title: 'Daily Kamaloka', gate: 'start', def: 'off', eval: 'kamaloka', kinds: ['daily Kamaloka'],
      what: 'Once a day the party runs a Kamaloka that fits every member, then goes back to what it did.',
      switch: 'party Settings → Daily', where: { label: 'Daily settings', settings: 'daily' } },
    { key: 'sevensigns', group: 'daily', title: 'Seven Signs sign-up', gate: 'start', def: 'off', eval: 'sevensigns', kinds: ['Seven Signs sign-up'],
      what: 'Enrolled characters sign up with the Lords of Dawn once a week (needed for catacombs and necropolises) and hand in seal stones.',
      switch: '7 Signs tab (enroll the party)', where: { label: '7 Signs tab', hash: '#/sevensigns' } },
    { key: 'siege', group: 'daily', title: 'Siege registration', gate: 'manual', def: 'manual',
      what: 'Never automatic: registering for a siege costs adena, so it is always your order.',
      switch: 'none — your order only (Fortresses / Castles tabs)', where: { label: 'Fortresses tab', hash: '#/forts' } },
    // ------------------------------------------------------------------------------------------------ clan (Dashboard/clanauto_api.js)
    { key: 'clanLevelUp', group: 'clan', scope: 'clan', title: 'Clan level-up', gate: 'start', def: 'off', eval: 'clan', clan: ['levelUp'],
      what: 'The clan leader raises the clan level by himself in town when SP, adena and the level item are there.',
      switch: 'Clan tab → Runs by itself', where: { label: 'Clan tab', hash: '#/clan' } },
    { key: 'clanItem', group: 'clan', scope: 'clan', title: 'Clan level item hand-over', gate: 'start', def: 'on', eval: 'clan', clan: ['itemHandover'],
      what: 'A character holding the item the next clan level needs trades it to the clan leader when both are in town.',
      switch: 'Clan tab → Runs by itself', where: { label: 'Clan tab', hash: '#/clan' } },
    { key: 'clanQuests', group: 'clan', scope: 'clan', title: 'Clan level quests', gate: 'start', def: 'off', eval: 'clan', clan: ['levelQuests'],
      what: 'Every 10 minutes the next step of the clan level quest is sent to a fitting party or the clan leader.',
      switch: 'Clan tab → Runs by itself', where: { label: 'Clan tab', hash: '#/clan' } },
    { key: 'clanInvite', group: 'clan', scope: 'clan', title: 'Clan invites', gate: 'start', def: 'on', eval: 'clan', clan: ['invite'],
      what: 'The clan leader invites only the characters / parties you ticked, when they stand next to him.',
      switch: 'Clan tab → Runs by itself (+ who gets invited)', where: { label: 'Clan tab', hash: '#/clan' } },
    { key: 'clanRaidQuests', group: 'clan', scope: 'clan', title: 'Clan raid quests', gate: 'start', def: 'on', eval: 'clan', clan: ['questDispatch', 'questActivate'],
      what: 'Every 10 minutes a fitting party is sent to a live boss of an active clan raid quest (for clan reputation).',
      switch: 'Clan tab → Runs by itself', where: { label: 'Clan tab', hash: '#/clan' } },
    { key: 'clanWh', group: 'clan', scope: 'clan', title: 'Clan warehouse list', gate: 'start', def: 'on', eval: 'clan', clan: ['warehouseLook'],
      what: 'After new deposits the clan leader looks into the clan warehouse in Giran so the dashboard list stays up to date.',
      switch: 'Clan tab → Runs by itself', where: { label: 'Clan tab', hash: '#/clan' } },
    { key: 'clanSkills', group: 'clan', scope: 'clan', title: 'Clan skills', gate: 'start', def: 'on', eval: 'clan', clan: ['skillLearn', 'skillFocus'],
      what: 'The clan leader learns the next clan skill when the reputation is there (and can pick which one by itself).',
      switch: 'Clan tab → Runs by itself', where: { label: 'Clan tab', hash: '#/clan' } },
  ];
  const GATE_TEXT = { always: 'always on', start: 'needs Start', switch: 'own switch', order: 'your order', manual: 'never automatic' };
  const byKey = {}; E.forEach(e => { byKey[e.key] = e; });
  /** every runAuto / RUN_ALWAYS kind the catalog covers (the test compares it with swarm.js) */
  const kinds = () => E.reduce((a, e) => a.concat(e.kinds || []), []);
  const API = { GROUPS, ENTRIES: E, GATE_TEXT, byKey, kinds };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.AutoCatalog = API;
})(typeof window !== 'undefined' ? window : this);
