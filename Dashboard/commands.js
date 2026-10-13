// COMMAND CATALOG (user 2026-10-08 18:45: "make sure I can give any command we have in the system to the characters or a party").
// One list, used by BOTH sides:
//   - Dashboard/server.js  require('./commands') -> ALLOWED (first words of every swarm command), slash-command whitelist, safety class
//   - Dashboard/index.html <script src="/commands.js"> -> window.SWARM_COMMANDS for the command center (Dashboard/cmdcenter.js)
// Inventory + table: docs/plan/dashboard_commands.md. Handlers live in Scripts_dev/swarm.js handleSay() (party chat) and in L2Swarm's own
// chat-box commands (CLAUDE.md §3). Never add a command here that does not exist there.
//
// Fields:
//   id      unique key                       title  short label           cat   category (CATS)
//   kind    'swarm' (!command, party chat)   'bot' (/command, L2Swarm chat box, per character)   'action' (dashboard endpoint)
//   tpl     what is sent: {arg} is replaced, [ ... ] is dropped when an arg inside it is empty
//   handler who acts on a swarm command:  'leader' = only the party leader acts, the party follows him
//           'each' = every window that hears it acts (party target = every member)   'self' = per character, optional [name] filter
//           'clanleader' = only the clan leader's window acts (target is always him)
//   targets which target kinds make sense (party | char | all | clan | chars)   def = default target kind
//   safety  'safe' (report / dry run) | 'confirm' (changes what they do) | 'destructive' (needs a second, typed confirm; server refuses without it)
//   re      optional regex on the whole command: this entry's safety applies only when it matches (e.g. /config set vs /config save)
//   args    [{ key, label, type, options?, optional?, placeholder?, def? }]  types: text number town boss kamaloka dungeon gk park cabinet onoff
//           char party parties fort castle siegeplan clanquest zmap item select (select: options [value | [value, label]])
//   hidden  true = not offered in the command center (search / sheets) — the handler still exists and a typed command still works;
//           hideWhy says why (CMDFIX 2026-10-12: dead in the leader-controlled design / nothing to run / duplicate)
//   nameForChar  true = a char:/chars: target gets its own name appended ('!delevel 40 Healer6'), so only that window acts even when the
//           character leads a party (party chat from a leader reaches his whole party; CMDFIX2 2026-10-12)
//   ttl     seconds a '!' order waits in the ORDER QUEUE (Dashboard/orderqueue.js, 2026-10-13) for a character that is not connected / not
//           ready yet before it expires unrun. Default: 10 min, 'safe' reports 2 min, !stop 5 min (a late retreat is worse than none: !soe 2 min)
(function (root) {
  const CATS = [
    ['move', 'Move / Travel', 'icon/etc_scroll_of_return_i00'],
    ['fight', 'Fight', 'icon/action003'],
    ['party', 'Party', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Clan'],
    ['supply', 'Supply / Items', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Inventory'],
    ['level', 'Leveling / Spots', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Map'],
    ['quest', 'Quests', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Quest'],
    ['raid', 'Raids / Kamaloka', 'icon/accessory_raid_master_i00'],
    ['clan', 'Clan / Sieges', 'L2UI_CT1/ICON_DF_SIEGE_SHIELD'],
    ['signs', 'Seven Signs', 'icon/etc_seal_of_sun_i00'],
    ['bot', 'Bot control', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Action'],
    ['client', 'Client mode / Account', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Character'],
    ['pc', 'PC / L2Swarm', 'L2UI_CT1/crop/Icon_DF_MenuWnd_SystemMenu'],
    ['debug', 'Debug / Reports', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Quest'],
    ['legacy', 'Legacy (off in leader mode)', 'L2UI_CT1/ICON_DF_Exclamation'],
  ];
  const TOWNS = ['Giran', 'Gludin', 'Gludio', 'Dion', 'Oren', 'Aden', 'Hunters', 'Heine', 'Goddard', 'Rune', 'Schuttgart'];
  const PARK = ['grocer', 'warehouse', 'weapons', 'armor', 'jewelry', 'blacksmith', 'symbol', 'start'];
  const CABINET = ['Forward Drop', "Follow Party Leader's Dialog", "Follow Party Leader's .town", "Follow Party Leader's Dead to Village", 'Block experience',
    'Block pet experience', 'Do not show traders', 'Disable Animations', 'Classic Shift', 'Translit',
    // section-qualified (2026-10-12, docs/plan/server_cfg.md): a bare "Party" hit Follow Party Leader's Dialog, "Master Account" / "Same IP"
    // exist in two sections. These work once patch_servercfg.js (cfgFind) is live; before it they answer "no setting" (nothing is clicked).
    'Quick Trade: Master Account', 'Quick Trade: Party', 'Quick Trade: Same IP', 'Quick Accept: Master Account', 'Quick Accept: Same IP'];
  const CLANQ = [['bloodmark', 'Blood Mark (clan level 2 -> 3)'], ['501', 'Q501 Proof of Clan Alliance (3 -> 4)'], ['503', 'Q503 Pursuit of Clan Ambition (4 -> 5)']];
  const PT = ['party', 'char', 'all', 'clan', 'chars'];        // every target kind
  const NAME = { key: 'name', label: 'Only this character (empty = everyone who hears it)', type: 'char', optional: true };

  const C = [
    // ---------------- Move / Travel ----------------
    { id: 'town', cat: 'move', kind: 'swarm', title: 'Town teleport (.town)', tpl: '!town {town}', handler: 'leader', targets: PT, def: 'party', safety: 'confirm',
      desc: 'The leader stops hunting, fights off / steps away, regroups and uses .<town> (the server takes the party along). Giran = the safe regroup trip. A member alone ports itself only when the leader is gone.',
      args: [{ key: 'town', label: 'Town', type: 'town', def: 'Giran' }], kw: 'teleport giran gludio dion aden oren heine rune goddard schuttgart hunters gludin' },
    { id: 'gk', cat: 'move', kind: 'swarm', title: 'Gatekeeper teleport', tpl: '!gk {dest}', handler: 'leader', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Walk to the nearest gatekeeper and click the link containing this text. Party: the leader regroups and clicks, the server brings the party; after his teleport + roll call anyone still left behind teleports itself. One member (character target): that character teleports ALONE (its leader may regroup it later).',
      args: [{ key: 'dest', label: 'Destination (link text)', type: 'gk', placeholder: 'Ruins of Agony' }], kw: 'teleport gatekeeper port' },
    { id: 'goto', cat: 'move', kind: 'swarm', title: 'Walk to…', tpl: '!goto {place}', handler: 'each', targets: PT, def: 'char', safety: 'confirm',
      desc: 'Walk to an NPC, a saved place (!mark) or "x y". Party target = every member walks. A party leader stops leveling for it and waits at the place for the next order.', args: [{ key: 'place', label: 'NPC / saved place / x y', type: 'text', placeholder: 'Helvetia  or  83473 148554' }], kw: 'walk move go' },
    { id: 'gotonpc', cat: 'move', kind: 'swarm', title: 'Go to an NPC (anywhere)…', tpl: '!goto npc {npc}', handler: 'leader', targets: PT, def: 'party', safety: 'confirm',
      desc: 'NPC atlas (Scripts/data/npc_atlas.json): the leader takes the party to the best matching NPC — .town to its town, the dungeon way in + room by room (floor teleporters on the way), or teleport near + walk — and opens its dialog. By id (#30487), name (Penelope), role (grocer, gatekeeper, warehouse, priest of dawn, class master, blacksmith … + optional town: "grocer dion") or what it offers ("teleport:Cruma Tower 2nd floor"). Add a character name at the end for that character alone (any case); a character target that is not the leader = that character alone.',
      args: [{ key: 'npc', label: 'NPC / role [town] / teleport:…', type: 'text', placeholder: 'grocer giran  ·  Penelope  ·  priest of dawn  ·  teleport:Cruma Tower 2nd floor' }], kw: 'npc find walk go priest grocer warehouse gatekeeper atlas' },
    { id: 'park', cat: 'move', kind: 'swarm', title: 'Park in Giran', tpl: '!park[ {place}]', handler: 'each', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Everyone stops, goes to Giran, walks the recorded route to the place and waits for orders (leveling stays paused).', args: [{ key: 'place', label: 'Place', type: 'park', def: 'grocer' }], kw: 'wait giran grocer warehouse' },
    { id: 'soe', cat: 'move', kind: 'swarm', title: 'Retreat (escape to town)', tpl: '!soe', handler: 'each', targets: PT, def: 'party', safety: 'confirm', ttl: 120,
      desc: 'Everyone (leader too) runs out of the fight and uses .townname (never a scroll). Inside a raid / Kamaloka it still retreats (your order wins) but warns in party chat first: raids are normally fought to the end.', kw: 'escape flee run' },
    { id: 'regroup', cat: 'move', kind: 'swarm', title: 'Regroup (home, restock, back)', tpl: '!regroup', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'Old regroup: everyone home, restock, back together. In leader mode !level / !supply are the normal way.', kw: 'home' },
    { id: 'return', cat: 'move', kind: 'swarm', title: 'Return (= Regroup in leader mode)', tpl: '!return', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', hidden: true, hideWhy: 'duplicate of Regroup in leader mode',
      desc: 'In leader mode exactly the same as Regroup: the supply run in Giran, then back to leveling (the old "without going home first" only works with CONFIG.lead off).' },
    { id: 'mark', cat: 'move', kind: 'swarm', title: 'Save leader position as a place', tpl: '!mark {name}', handler: 'leader', targets: ['party'], def: 'party', safety: 'safe',
      desc: 'The leader saves where he stands; "Walk to…" can use the name later.', args: [{ key: 'name', label: 'Place name', type: 'text', placeholder: 'Giran square' }] },
    { id: 'places', cat: 'move', kind: 'swarm', title: 'List saved places', tpl: '!places', handler: 'leader', targets: ['party'], def: 'party', safety: 'safe', desc: 'The leader lists the saved places (party chat + his notes on the dashboard).' },
    { id: 'b_moveto', cat: 'move', kind: 'bot', title: 'Move to x y (L2Swarm)', tpl: '/moveto {x} {y}[ {z}]', targets: PT, def: 'char', safety: 'confirm',
      desc: "L2Swarm's own move command (no team logic).", args: [{ key: 'x', label: 'x', type: 'number' }, { key: 'y', label: 'y', type: 'number' }, { key: 'z', label: 'z', type: 'number', optional: true }] },
    { id: 'b_run', cat: 'move', kind: 'bot', title: 'Run', tpl: '/run', targets: PT, def: 'char', safety: 'safe', desc: 'Switch to running.' },
    { id: 'b_walk', cat: 'move', kind: 'bot', title: 'Walk (slow)', tpl: '/walk', targets: PT, def: 'char', safety: 'confirm', desc: 'Switch to walking speed.' },
    { id: 'b_unstuck', cat: 'move', kind: 'bot', title: '/unstuck (to the nearest town)', tpl: '/unstuck', targets: ['char', 'chars'], def: 'char', safety: 'destructive',
      desc: 'Last resort: the server sends the character to a town after a long cast. Breaks off whatever it does.' },
    { id: 'navtest', cat: 'debug', kind: 'swarm', title: 'Navigation test', tpl: '!navtest {x} {y}[ {name}]', handler: 'each', targets: ['char', 'party'], def: 'char', safety: 'confirm',
      desc: 'Walk test with logging -> Logs/navtest_<name>.log (disables the bot for 60 s, then switches it back on; the name is case-insensitive).', args: [{ key: 'x', label: 'x', type: 'number' }, { key: 'y', label: 'y', type: 'number' }, NAME] },

    // ---------------- Fight ----------------
    { id: 'stop', cat: 'fight', kind: 'swarm', title: 'STOP everything (switch OFF)', tpl: '!stop', handler: 'each', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Everyone idle + stop combat, and the party\'s run switch goes OFF: it does nothing on its own (no leveling, supply runs, regroups, resume after a restart) until Start. Survival, trades and your orders still work. Same as Stop on the party card.', kw: 'halt pause idle off switch' },
    // RUNSTATE (owner 2026-10-13): the manual run switch. Start on the party card = this + the switch ON (Dashboard/runswitch.js, POST /api/runstate)
    { id: 'start', cat: 'fight', kind: 'swarm', title: 'START (switch ON + its activity)', tpl: '!start[ {name}]', handler: 'leader', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Switches the party ON and starts its configured activity: the raid circuit when it is switched on for the party, else leveling at the chosen spot / hunt here / the leader\'s pick (Giran regroup first). Already running = nothing new. With a member\'s name: that member is back with its party (follow + assist). Same as Start on the party card.', args: [{ key: 'name', label: 'Only this member (optional)', type: 'char', optional: true }], kw: 'start run on go resume switch' },
    { id: 'kill', cat: 'fight', kind: 'swarm', title: 'Kill a monster by name', tpl: '!kill {name}', handler: 'each', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Everyone who hears it attacks the nearest monster with that name (within 4000).', args: [{ key: 'name', label: 'Monster name', type: 'text', placeholder: 'Bifrons' }], kw: 'attack' },
    { id: 'assist', cat: 'fight', kind: 'swarm', title: 'Help a character (party goes there)', tpl: '!assist {who}', handler: 'leader', targets: PT, def: 'party', safety: 'confirm',
      desc: 'The leader takes the team to that character and hunts around him until "!assist off".', args: [{ key: 'who', label: 'Character to help', type: 'char' }], kw: 'help follow' },
    { id: 'assistoff', cat: 'fight', kind: 'swarm', title: 'Stop helping (normal spots)', tpl: '!assist off', handler: 'leader', targets: PT, def: 'party', safety: 'confirm', desc: 'Back to the normal hunting spots / follow the leader.' },
    // USER OVERRIDE (user 2026-10-09 09:50: "an override button to ask a person to cast a skill or take a mana potion etc." + "direct orders on the character page"): one action, ONCE, any time,
    // on ONE character, even mid-raid (swarm.js raidOverride). The name is part of the command: party chat reaches the whole party, only that
    // character's window acts. Result: Logs/override_<name>.json -> toast on the live raid view. Also on every team card of the live raid view.
    // CMDFIX2 2026-10-12: server.js commandPlan always sends an '!ov <name> ...' from <name> itself (another picked target never heard it);
    // the command center keeps the Character arg and the target chip the same.
    { id: 'ovcast', cat: 'fight', kind: 'swarm', title: 'Override: cast a skill', tpl: '!ov {name} cast {skill}[ {on}]', re: /^!ov\s+\S+\s+cast\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character casts the skill once (skill id), on: boss | focus | self | <teammate> | <monster in sight> (empty: on its CURRENT target).',
      args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'skill', label: 'Skill id', type: 'number', placeholder: '1015' }, { key: 'on', label: 'On (boss / focus / self / name)', type: 'text', optional: true, placeholder: 'boss' }], kw: 'override skill cast heal nuke' },
    { id: 'ovuse', cat: 'fight', kind: 'swarm', title: 'Override: use an item', tpl: '!ov {name} use {item}', re: /^!ov\s+\S+\s+use\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character uses the item once (item id): Mana Potion 728, Greater Healing Potion 1061 (and 1539), CP potions, scrolls.',
      args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'item', label: 'Item id', type: 'number', placeholder: '728' }], kw: 'override potion mana item' },
    { id: 'ovtarget', cat: 'fight', kind: 'swarm', title: 'Override: target', tpl: '!ov {name} target {on}', re: /^!ov\s+\S+\s+target\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character selects boss | focus | <name> (a teammate or a monster in sight).', args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'on', label: 'Target', type: 'text', placeholder: 'boss' }], kw: 'override select' },
    { id: 'ovattack', cat: 'fight', kind: 'swarm', title: 'Override: attack', tpl: '!ov {name} attack[ {on}]', re: /^!ov\s+\S+\s+attack\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character attacks boss | focus | <monster> (empty: the raid focus / boss, else its current target when that is a living monster).', args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'on', label: 'Target', type: 'text', optional: true, placeholder: 'focus' }], kw: 'override hit' },
    { id: 'ovstop', cat: 'fight', kind: 'swarm', title: 'Override: stop attacking', tpl: '!ov {name} stop', re: /^!ov\s+\S+\s+stop\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character stops its attack / cast and drops the target once (its raid routine may pick a target again).', args: [{ key: 'name', label: 'Character', type: 'char' }], kw: 'override cancel' },
    { id: 'ovmove', cat: 'fight', kind: 'swarm', title: 'Override: move to', tpl: '!ov {name} move {to}', re: /^!ov\s+\S+\s+move\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character walks next to tank | boss | <teammate>.', args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'to', label: 'To (tank / boss / name)', type: 'text', placeholder: 'tank' }], kw: 'override walk' },
    // RESURRECTION 2026-10-13 (owner: "use 'Scroll of Resurrection' via an action or the Resurrection skill and then select a party member that is dead"):
    // + how; the character walks into range (up to 12000), targets the body by object id and casts / reads (swarm.js resManual -> resRun)
    { id: 'ovres', cat: 'fight', kind: 'swarm', title: 'Override: resurrect a teammate', tpl: '!ov {name} res {who}[ {how}]', re: /^!ov\s+\S+\s+res\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character walks to the dead teammate\'s body (also mid-raid), targets it and resurrects it: its res skill, a Scroll of Resurrection or a Blessed Scroll (empty: the skill first, else a scroll). The raised one rebuffs first, then follows again.', args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'who', label: 'Dead teammate', type: 'char' }, { key: 'how', label: 'How', type: 'select', optional: true, options: [['', 'automatic (skill first, else a scroll)'], ['skill', 'res skill'], ['scroll', 'Scroll of Resurrection'], ['blessed', 'Blessed Scroll of Resurrection']] }], kw: 'override rez resurrect scroll blessed' },
    { id: 'res', cat: 'fight', kind: 'swarm', title: 'Resurrect a dead member (best one near)', tpl: '!res {who}[ {how}]', handler: 'each', targets: ['party', 'char', 'chars'], def: 'party', safety: 'confirm', ttl: 120,
      desc: 'Every window of the party decides; the best one near acts: a res skill first, else the nearest one with a Scroll of Resurrection (healers and the tank last). Works also when automatic res is off and in a raid (your order). Runs up to 2 min.', args: [{ key: 'who', label: 'Dead member', type: 'char' }, { key: 'how', label: 'How', type: 'select', optional: true, options: [['', 'automatic (skill first, else a scroll)'], ['skill', 'res skill'], ['scroll', 'Scroll of Resurrection'], ['blessed', 'Blessed Scroll of Resurrection']] }], kw: 'rez resurrect revive scroll dead raise' },
    { id: 'resall', cat: 'fight', kind: 'swarm', title: 'Res all dead', tpl: '!resall', handler: 'each', targets: ['party'], def: 'party', safety: 'confirm', ttl: 120,
      desc: 'Every dead member of the party: healers first, then the tank, then the rest; a res skill first, else anyone with a scroll (also in a raid). Each one raised rebuffs first. Runs up to 2 min.', kw: 'rez resurrect revive all dead raise mass' },
    { id: 'ovsoe', cat: 'fight', kind: 'swarm', title: 'Override: Scroll of Escape NOW', tpl: '!ov {name} soe', re: /^!ov\s+\S+\s+soe\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character reads a Scroll of Escape at once (an explicit order; the bots themselves only use .townname). Its bot is off during the cast; a hit can still interrupt it — a second toast says teleported / interrupted.', args: [{ key: 'name', label: 'Character', type: 'char' }], kw: 'override escape soe town' },
    { id: 'ovdrop', cat: 'fight', kind: 'swarm', title: 'Override: DROP an item', tpl: '!ov {name} drop {obj}[ {count}]', re: /^!ov\s+\S+\s+drop\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'destructive',
      desc: 'That character drops the item (inventory OBJECT id) on the ground. Never equipped or quest items (it refuses). Destructive: typed YES.', args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'obj', label: 'Item object id', type: 'number' }, { key: 'count', label: 'How many (empty = all)', type: 'number', optional: true }], kw: 'override drop throw away' },
    { id: 'buff', cat: 'fight', kind: 'swarm', title: 'Rebuff (board buffs, one at a time)', tpl: '!buff', handler: 'each', targets: PT, def: 'party', safety: 'confirm', desc: 'Forced rebuff queue; characters that already have their buffs skip it.', kw: 'buffs' },
    { id: 'buffauto', cat: 'fight', kind: 'swarm', title: 'Auto-rebuff on/off', tpl: '!buffauto {on}', handler: 'each', targets: PT, def: 'party', safety: 'confirm', desc: 'Automatic rebuff rotation on or off (until a script reload).', args: [{ key: 'on', label: 'Auto-rebuff', type: 'onoff', def: 'on' }] },
    { id: 'zone', cat: 'fight', kind: 'swarm', title: 'Fight in a .zmap zone', tpl: '!zone {file}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'The party levels inside a drawn Settings\\<file>.zmap (a forced hunting spot like !assist: travels there unless already in it, hunts only inside the zone) until "!zone off".', args: [{ key: 'file', label: 'Zone file in Settings', type: 'zmap', placeholder: 'fightzone_under20.zmap' }] },
    { id: 'b_attack', cat: 'fight', kind: 'bot', title: 'Attack target', tpl: '/attack', targets: PT, def: 'char', safety: 'confirm', desc: 'Attack the current target (L2Swarm).' },
    { id: 'b_attackforce', cat: 'fight', kind: 'bot', title: 'Force attack target', tpl: '/attackforce', targets: ['char', 'chars'], def: 'char', safety: 'destructive', desc: 'Force attack (works on players: PvP flag / karma risk).' },
    { id: 'b_attackround', cat: 'fight', kind: 'bot', title: 'Attack the target once (one combat round)', tpl: '/attackround', targets: PT, def: 'char', safety: 'confirm', desc: 'One L2Swarm combat round on the CURRENT target only (needs a target within 2000, else nothing happens; it stops L2Swarm\'s combat loop if that runs). Select the target first (Target by name).', kw: 'attack round' },
    { id: 'b_target', cat: 'fight', kind: 'bot', title: 'Target by name', tpl: '/target {name}', targets: PT, def: 'char', safety: 'confirm', desc: 'Select a target by name.', args: [{ key: 'name', label: 'Name', type: 'text' }] },
    { id: 'b_startcombat', cat: 'fight', kind: 'bot', title: 'Start L2Swarm combat', tpl: '/startcombat', targets: PT, def: 'char', safety: 'confirm',
      desc: "L2Swarm's own combat loop. Members use script attacks since the 2026-10-08 deadlock (patch v6 installed, still careful)." },
    { id: 'b_stopcombat', cat: 'fight', kind: 'bot', title: 'Stop L2Swarm combat', tpl: '/stopcombat', targets: PT, def: 'char', safety: 'confirm', desc: "Stop L2Swarm's combat loop now, and (through the file channel) the script's own fight in dungeons / raids / solo. The script's hunt starts it again later - Stop (!stop) is the real stop." },
    // CMDFIX2 2026-10-12: L2Swarm's /sit and /stand are ONE toggle (RequestActionUse 0): the dashboard sends them through the file channel, where
    // swarm.js only sends the toggle when the character is not already sitting / standing (needs the swarm.js deploy of 2026-10-12)
    { id: 'b_sit', cat: 'fight', kind: 'bot', title: 'Sit', tpl: '/sit', targets: PT, def: 'char', safety: 'confirm', desc: 'Sit down (a sitting character cannot walk). Skipped when already sitting; the script stands it up before its next walk.' },
    { id: 'b_stand', cat: 'fight', kind: 'bot', title: 'Stand up', tpl: '/stand', targets: PT, def: 'char', safety: 'confirm', desc: 'Stand up. Skipped when already standing (L2Swarm\'s /stand is a sit/stand toggle).' },

    // ---------------- Party ----------------
    { id: 'status', cat: 'party', kind: 'swarm', title: 'Status report', tpl: '!status', handler: 'each', targets: PT, def: 'party', safety: 'safe', desc: 'Everyone reports role, mode, HP/MP, buffs in party chat.', kw: 'report' },
    { id: 'collect', cat: 'party', kind: 'swarm', title: 'Collect adena to the leader', tpl: '!collect', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'Members trade adena above their keep (2M <40, 2.5M 40-75, 3M 76+) to their leader (team trades are pre-approved).', kw: 'money' },
    { id: 'cabinet', cat: 'party', kind: 'swarm', title: 'Cabinet setting on/off', tpl: '!cabinet {setting} {on}', handler: 'each', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Alt+B -> Cabinet -> Settings: toggle a row (e.g. Forward Drop).', args: [{ key: 'setting', label: 'Setting', type: 'cabinet', def: 'Forward Drop' }, { key: 'on', label: 'Value', type: 'onoff', def: 'on' }], kw: 'forward drop settings' },
    // SERVER .cfg 2026-10-12 (forum topic 60, docs/plan/server_cfg.md). Handler = scratchpad patch_servercfg.js (swarm.js !cfg; until it is
    // deployed the bots ignore the word). Nothing is applied automatically (server_cfg.json botDefaults.autoApply stays false).
    { id: 'cfg', cat: 'party', kind: 'swarm', title: 'Server settings (.cfg): report', tpl: '!cfg[ {name}]', handler: 'self', targets: PT, def: 'party', safety: 'safe',
      desc: 'Each character reads Alt+B -> Cabinet -> Settings and reports what differs from Scripts/data/server_cfg.json botDefaults.want (party chat + Logs/servercfg_<name>.json). Changes nothing.', args: [NAME], kw: 'cfg settings cabinet quick trade follow check' },
    { id: 'cfgapply', cat: 'party', kind: 'swarm', title: 'Server settings (.cfg): apply the bot defaults', tpl: '!cfg apply[ {name}]', re: /^!cfg\s+apply\b/i, handler: 'self', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Each character sets the rows of server_cfg.json botDefaults.want that differ (English, Translit Off, Follow Dialog/.town/Dead On, Quick Trade + Quick Accept On). Never Block experience (the level lock owns it) or Forward Drop (your decision).', args: [NAME], kw: 'cfg settings cabinet quick trade apply' },
    { id: 'b_partyinfo', cat: 'party', kind: 'bot', title: 'Party info', tpl: '/partyinfo', targets: PT, def: 'char', safety: 'safe', desc: "L2Swarm party info (shows in the bot's log)." },
    { id: 'b_invite', cat: 'party', kind: 'bot', title: 'Invite to party', tpl: '/invite {name}', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Invite a player to this character\'s party (the bots re-invite their own team by themselves).', args: [{ key: 'name', label: 'Player', type: 'char' }] },
    { id: 'b_leave', cat: 'party', kind: 'bot', title: 'Leave party', tpl: '/leave', targets: ['char', 'chars'], def: 'char', safety: 'destructive', desc: 'Leave the party (the leader re-invites teammates within ~10 s).' },
    { id: 'b_socialyes', cat: 'party', kind: 'bot', title: 'Social: yes', tpl: '/socialyes', targets: PT, def: 'char', safety: 'safe', desc: 'Social action.' },
    { id: 'b_socialdance', cat: 'party', kind: 'bot', title: 'Social: dance', tpl: '/socialdance', targets: PT, def: 'char', safety: 'safe', desc: 'Social action.' },
    { id: 'b_socialhello', cat: 'party', kind: 'bot', title: 'Social: hello', tpl: '/socialhello', targets: PT, def: 'char', safety: 'safe', desc: 'Social action.' },
    // CMDFIX2 2026-10-12: L2Swarm's /ignore is an EXACT rule for the SELECTED MONSTER (mob settings ToAttack/ToSpoil off); "/ignore Bob" was said in public chat
    { id: 'b_ignore', cat: 'fight', kind: 'bot', title: 'Do not attack the selected monster', tpl: '/ignore', targets: ['char', 'chars'], def: 'char', safety: 'confirm', desc: 'Select the monster first (Target by name). L2Swarm adds it to the mob settings with attack + spoil off (not a player chat block - L2Swarm has none).', kw: 'ignore mob skip monster' },
    { id: 'b_trade', cat: 'party', kind: 'bot', title: 'Trade with target', tpl: '/trade', targets: ['char'], def: 'char', safety: 'destructive', desc: 'Open a trade with the current target. Trades with players outside our teams need your OK.' },

    // ---------------- Supply / Items ----------------
    { id: 'supply', cat: 'supply', kind: 'swarm', title: 'Supply run (Giran)', tpl: '!supply', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'Leader takes the team to Giran, buys SoE/SoR/shots/spirit ore/potions for everyone at Helvetia and hands it out (also gear upgrades + enchants when enabled).', kw: 'restock buy shots scrolls' },
    { id: 'restock', cat: 'supply', kind: 'swarm', title: 'Restock (= supply in leader mode)', tpl: '!restock', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Same as Supply in the leader-controlled design.' },
    { id: 'sell', cat: 'supply', kind: 'swarm', title: 'Sell marked items + junk', tpl: '!sell[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'confirm',
      desc: 'Walk to the nearest merchant (towns only) and sell what Scripts/data/sell_list.json marks + junk.', args: [NAME] },
    { id: 'gearup', cat: 'supply', kind: 'swarm', title: 'Better gear now', tpl: '!gearup[ {name}]', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'Leader takes the team to Giran; everyone (or only <name>) buys + puts on the upgrades, then leveling resumes.', args: [{ key: 'name', label: 'Only this character (empty = everyone)', type: 'char', optional: true }], kw: 'upgrade gear armor weapon' },
    // PURSE 2026-10-13: the leader pays a member's gear money now (the "Needs you" card's Give it now); swarm.js purseOrder
    { id: 'pursegive', cat: 'supply', kind: 'swarm', title: 'Leader pays gear money now', tpl: '!purse give {name}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'The party leader takes the team to Giran, trades the member (or "all") what its planned gear upgrades miss (it keeps its pocket money; the leader keeps his "keeps at least", 2M by default), then the paid members buy their upgrades. Works also while "Leader pays" is off (this is your order).',
      args: [{ key: 'name', label: 'Member (or "all")', type: 'text', placeholder: 'all' }], kw: 'adena money pay purse gear leader pays give' },
    { id: 'pursestatus', cat: 'supply', kind: 'swarm', title: 'Gear money status', tpl: '!purse', handler: 'leader', targets: ['party'], def: 'party', safety: 'safe',
      desc: 'The leader says in party chat whether "Leader pays" is on and what each member misses for its planned gear. Pays nothing.', kw: 'adena money purse gear status' },
    { id: 'gearplan', cat: 'supply', kind: 'swarm', title: 'Gear plan (dry run)', tpl: '!gearplan[ {name}]', handler: 'self', targets: PT, def: 'party', safety: 'safe', desc: 'What each would buy (never buys) -> Logs/gear_plan_<name>.json + party chat.', args: [NAME] },
    { id: 'upgrade', cat: 'supply', kind: 'swarm', title: 'Buy + wear upgrades here (in Giran)', tpl: '!upgrade[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'confirm', desc: 'Must stand in Giran. Buys and equips the planned upgrades. A party order without a name: one after another, 7 s apart (the shops do not answer ten at once).', args: [NAME] },
    { id: 'stash', cat: 'supply', kind: 'swarm', title: 'Warehouse: deposit what I do not use', tpl: '!stash[ {dest}][ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'confirm',
      desc: 'Warehouse at Taurin (Giran, recorded route). WHICH warehouse: Scripts/data/stash_rules.json dest (today "clan" = clan members put it into the CLAN warehouse, where only the clan leader can take items out; others the private one) — or pick private / clan for this order. Crafting materials (not the crafter), recipes it cannot use, seal stones, ancient adena, L2Day letters, old gear nobody plans. Consumables, quest items, upgrades stay; untradeable items never go to the clan warehouse. A leader / solo character outside Giran goes there first; members must be in Giran. Fee 30 adena per item. The report names the warehouse used.',
      args: [{ key: 'dest', label: 'Warehouse', type: 'select', optional: true, options: [['', 'my rule (stash_rules.json)'], ['private', 'private'], ['clan', 'clan']] }, NAME], kw: 'warehouse deposit bag full inventory materials stash clan private' },   // CMDFIX2 supply 2026-10-12: dest
    { id: 'stashplan', cat: 'supply', kind: 'swarm', title: 'Warehouse plan (dry run)', tpl: '!stashplan[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'safe',
      desc: 'What would go into the warehouse and why (deposits nothing) -> Logs/stash_plan_<name>.json + party chat.', args: [NAME], kw: 'warehouse deposit plan stash dry run' },
    // STORAGE 2026-10-13 (dashboard Storage page): event letters to the letters receiver now (Scripts/data/stash_rules.json letters; also when the automatic hand-over is off)
    { id: 'letters', cat: 'supply', kind: 'swarm', title: 'Event letters: hand them over now', tpl: '!letters[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'confirm',
      desc: 'Hands the event letters (L2Day - A ... II, or the items ticked on the Storage page) to the letters receiver (default: the clan leader). Only when both are idle in the same town; nobody travels for it. Uses the Trade page hand-over (walk over, receiver stands still, batches).', args: [NAME], kw: 'letters l2day event alphabet hand over clan leader storage' },
    // WAREHOUSE TAKE (D8, user 2026-10-12: "take needed items from the private / clan warehouse, from the gear tab"; swarm.js WHTAKE block, UNTESTED live)
    { id: 'whtake', cat: 'supply', kind: 'swarm', title: 'Warehouse: take items out (private)', tpl: '!whtake {items} private[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'confirm',
      desc: 'The character walks to the warehouse keeper (Giran: Taurin; another town: the nearest keeper; in the field a leader / solo character goes .giran first, a member must be in a town), opens its PRIVATE withdraw list and takes these items (id:count, :all = every piece / the whole stack). Report in party chat + Logs/whtake.log. The Gear page sends it with "Take from warehouse".',
      args: [{ key: 'items', label: 'Items (id:count, comma separated)', type: 'text', placeholder: '356:1,1463:500' }, NAME], kw: 'warehouse withdraw take out private gear items' },
    { id: 'whtakeclan', cat: 'clan', kind: 'swarm', title: 'Warehouse: take items out (clan)', tpl: '!whtake {items} clan[ {name}]', re: /^!whtake\s+\S+\s+clan\b/i, handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'Only the clan leader can take items out of the clan warehouse on L2Toggle: he walks to the keeper, takes these items (id:count) and, when a character is named, brings them to it with a hand-over (Logs/handover/wht_*.json). A member that gets this order asks the clan leader itself.',
      args: [{ key: 'items', label: 'Items (id:count, comma separated)', type: 'text', placeholder: '356:1,1463:500' }, { key: 'name', label: 'For this character (empty = the clan leader keeps it)', type: 'char', optional: true }], kw: 'clan warehouse withdraw take out gear items' },
    // HANDOVER (user 2026-10-10): the Trade page (#/trade) writes Logs/handover/<id>.json and sends this to every giver + the receiver
    { id: 'handover', cat: 'supply', kind: 'swarm', title: 'Hand-over (Trade page order)', tpl: '!handover {id}', handler: 'each', targets: ['chars', 'char', 'party'], def: 'chars', safety: 'confirm',
      desc: 'Run a hand-over the Trade page saved (Logs/handover/<id>.json): each giver goes to the receiver (.townname / walk / route) and trades its list in batches; the receiver stands still and accepts only from our characters. Build orders on the Trade page (#/trade), not here. The same id can be sent again a minute later (after a failed / stopped run); a giver busy with another order says so.',
      args: [{ key: 'id', label: 'Order id (from the Trade page)', type: 'text', placeholder: 'hm2abc12xyz' }], kw: 'trade give hand over clan leader items loot materials' },
    { id: 'handoverstop', cat: 'supply', kind: 'swarm', title: 'Stop a hand-over', tpl: '!handover stop[ {id}]', re: /^!handover\s+stop\b/i, handler: 'each', targets: ['chars', 'char', 'party', 'all'], def: 'party', safety: 'confirm',
      desc: 'Givers stop after the current trade window; the receiver stops waiting. Empty id = every hand-over.', args: [{ key: 'id', label: 'Order id (empty = all)', type: 'text', optional: true }], kw: 'trade stop cancel handover' },
    { id: 'enchant', cat: 'supply', kind: 'swarm', title: 'Enchant gear (manual only)', tpl: '!enchant {name}[ {item}][ +{to}][ {blessed}]', handler: 'self', targets: ['char'], def: 'char', safety: 'destructive',
      desc: 'NEVER automatic (user 2026-10-12). Enchants with the scrolls in the bag. Item empty = every worn piece to the safe +4; or weapon / armor / any words of an item name (worn or in the bag). Level above +4 is allowed: a failed normal scroll destroys the item, a blessed one resets it to +0. Common items and no-grade cannot be enchanted.',
      args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'item', label: 'Item (empty = all worn; weapon; armor; or part of the name)', type: 'text', optional: true, placeholder: 'weapon' }, { key: 'to', label: 'To level (empty = safe +4)', type: 'number', optional: true, placeholder: '4' }, { key: 'blessed', label: 'Type blessed to use blessed scrolls', type: 'text', optional: true, placeholder: 'blessed' }], kw: 'enchant scroll safe blessed weapon armor' },
    // SKILL ENCHANT 2026-10-12 (forum topic 2753; user rule: NEVER automatic): one attempt per order. Handler = scratchpad patch_skillenchant.js
    // (swarm.js !skillenchant; until it is deployed the bots ignore the word). Page: #/skillenchant (Enchant +N… buttons send the first form).
    { id: 'skillenchant', cat: 'supply', kind: 'swarm', title: 'Skill enchant: one attempt (manual only)', tpl: '!skillenchant {skill} {route}[ {safe}] {name}', handler: 'self', targets: ['char'], def: 'char', safety: 'destructive',
      desc: 'ONE attempt of the next + level of this skill on this route (3rd class, level 76+). Normal: SP + adena, Giant\'s Codex for +1, a fail drops the skill to its base level. Safe: x5 SP/adena + Giant\'s Codex - Mastery every try, a fail keeps the level. The character re-checks level, class, SP, adena and the book first. Route ids and chances: dashboard #/skillenchant.',
      args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'skill', label: 'Skill id', type: 'number', placeholder: '1239' }, { key: 'route', label: 'Route (1-7, see #/skillenchant)', type: 'number', placeholder: '1' }, { key: 'safe', label: 'Mode', type: 'select', optional: true, options: [['', 'normal'], ['safe', 'safe (x5, Mastery codex)']] }], kw: 'skill enchant codex route sp' },
    { id: 'skillenchantnext', cat: 'supply', kind: 'swarm', title: 'Skill enchant: next recommended step (one attempt)', tpl: '!skillenchant next[ {safe}] {name}', re: /^!skillenchant\s+next\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'destructive',
      desc: 'ONE attempt of the first step of the character\'s recommended plan (dashboard routes, at least the minimum chance). Never repeats by itself.',
      args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'safe', label: 'Mode', type: 'select', optional: true, options: [['', 'normal'], ['safe', 'safe (x5, Mastery codex)']] }], kw: 'skill enchant next codex' },
    { id: 'skillenchantcheck', cat: 'supply', kind: 'swarm', title: 'Skill enchant: what would be next (report)', tpl: '!skillenchant check[ {name}]', re: /^!skillenchant\s+check\b/i, handler: 'self', targets: PT, def: 'char', safety: 'safe',
      desc: 'Each character reports its next recommended skill enchant (chance, SP, adena, book) or why not. Enchants nothing.', args: [NAME], kw: 'skill enchant check report' },
    { id: 'dyeplan', cat: 'supply', kind: 'swarm', title: 'Dye plan (dry run)', tpl: '!dyeplan[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'safe', desc: 'Which symbol would be drawn next (buys nothing).', args: [NAME] },
    { id: 'dyes', cat: 'supply', kind: 'swarm', title: 'Buy dyes + draw symbol (Giran)', tpl: '!dyes[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'confirm', desc: 'Must stand in Giran. UNTESTED.', args: [NAME] },
    { id: 'shopscan', cat: 'supply', kind: 'swarm', title: 'Scan the Giran equipment shops', tpl: '!shopscan {name}', handler: 'self', targets: ['party', 'char'], def: 'char', safety: 'safe', desc: 'That character reads every Giran equipment shop (never buys) -> Logs/shopscan.json.', args: [{ key: 'name', label: 'Character', type: 'char' }] },
    { id: 'soulget', cat: 'supply', kind: 'swarm', title: 'Soul crystals: fetch (Gideon, Oren)', tpl: '!soul get', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Lvl 40+: the leader takes the team to Gideon for free crystals.' },
    { id: 'soulstore', cat: 'supply', kind: 'swarm', title: 'Soul crystals: store finished ones', tpl: '!soul store', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'The leader takes the team to Taurin (Giran); everyone puts its finished crystals into its warehouse — which one follows Scripts/data/stash_rules.json like !stash (clan members: the CLAN warehouse today, only the clan leader can take them out; untradeable ones go private).' },   // CMDFIX2 supply 2026-10-12
    { id: 'soulstat', cat: 'supply', kind: 'swarm', title: 'Soul crystals: status', tpl: '!soul', handler: 'each', targets: PT, def: 'party', safety: 'safe', desc: 'Everyone reports its crystals in party chat.' },
    { id: 'soulonoff', cat: 'supply', kind: 'swarm', title: 'Soul crystals: use on/off', tpl: '!soul {on}', re: /^!soul\s+(on|off)\b/i, handler: 'each', targets: PT, def: 'party', safety: 'confirm', desc: 'Crystal use on or off (until a reload).', args: [{ key: 'on', label: 'Crystal use', type: 'onoff', def: 'on' }] },
    // SOUL HUNT 2026-10-12 (forum topic 503 + datapack): handler = scratchpad patch_soulcrystal.js (swarm.js "!soul hunt"; before the deploy the bots answer with the status).
    { id: 'soulhunt', cat: 'supply', kind: 'swarm', title: 'Soul crystals: hunt where they level', tpl: '!soul hunt[ {off}]', re: /^!soul\s+hunt\b/i, handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'The leader picks the reachable hunting spot whose monsters accept the team\'s crystal stages (killers only; healers level on party bosses) and hunts there, re-checked every 5 min, until "!soul hunt off". Crystals tab -> Stage plan shows the same data.',
      args: [{ key: 'off', label: 'Stop it', type: 'select', optional: true, options: [['', 'start / re-pick'], ['off', 'off']] }], kw: 'soul crystal hunt spot stage' },
    { id: 'b_buyitem', cat: 'supply', kind: 'bot', title: 'Buy item (open shop)', tpl: '/buyitem {id} {count}', targets: ['char', 'chars'], def: 'char', safety: 'confirm', desc: 'L2Swarm buy from the open NPC shop (the bots use their own buy packets).', args: [{ key: 'id', label: 'Item', type: 'item' }, { key: 'count', label: 'Count', type: 'number', def: '1' }] },
    { id: 'b_sellitem', cat: 'supply', kind: 'bot', title: 'Sell item (open shop)', tpl: '/sellitem {id} {count}', targets: ['char'], def: 'char', safety: 'destructive', desc: 'L2Swarm sell to the open NPC shop. Silently ignored by L2Toggle on 3.8.5 and never re-tested since: use "Sell marked items + junk" (!sell, own sell packets) instead.', args: [{ key: 'id', label: 'Item', type: 'item' }, { key: 'count', label: 'Count', type: 'number', def: '1' }] },
    { id: 'b_clicklink', cat: 'supply', kind: 'bot', title: 'Click dialog link', tpl: '/clicklink {text}', targets: ['char', 'chars'], def: 'char', safety: 'confirm', desc: 'Click a link with this text in the open NPC dialog.', args: [{ key: 'text', label: 'Link text', type: 'text' }] },

    // ---------------- Leveling / Spots ----------------
    { id: 'level', cat: 'level', kind: 'swarm', title: 'Level (Giran -> hunting spot)', tpl: '!level', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'Regroup in Giran, the leader picks a spot for the lowest level (or the party spot chosen on the Parties tab) and teleports the team.', kw: 'grind farm xp autolevel' },
    { id: 'autolevel', cat: 'level', kind: 'swarm', title: 'Auto-level (same as Level)', tpl: '!autolevel', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'In leader mode = !level.' },
    { id: 'autosolo', cat: 'level', kind: 'swarm', title: 'Auto-level solo', tpl: '!autolevel solo', handler: 'each', targets: ['char', 'chars'], def: 'char', safety: 'confirm', desc: 'This character levels on its own (no party logic). Only for a character WITHOUT a party: a party member / leader answers why not (CMDFIX2 2026-10-12: it used to send the whole party solo).' },
    { id: 'autostop', cat: 'level', kind: 'swarm', title: 'Stop leveling', tpl: '!autolevel stop', handler: 'each', targets: PT, def: 'party', safety: 'confirm', desc: 'Stop the leveling loop (no full stop). The leader then waits for the next order (no automatic restart after 3 idle minutes).' },
    { id: 'dungeon', cat: 'level', kind: 'swarm', title: 'Level inside a catacomb / necropolis', tpl: '!dungeon {dungeon}', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'The team levels in that dungeon until "!dungeon off" (Seven Signs: Dawn needed).', args: [{ key: 'dungeon', label: 'Dungeon', type: 'dungeon' }], kw: 'catacomb necropolis' },
    { id: 'dungeonoff', cat: 'level', kind: 'swarm', title: 'Dungeon off (normal spots)', tpl: '!dungeon off', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Back to the normal hunting spots.' },
    { id: 'classchange', cat: 'level', kind: 'swarm', title: 'Class change (Community Board)', tpl: '!classchange[ {name}]', handler: 'self', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Alt+B -> Career -> Professions — ONLY the next step of each character’s APPROVED class plan (Classes page, Scripts/data/class_plans.json) once its level allows it (20/40/76). No plan / not approved = refused (said in party chat). The leader also orders it by himself for approved plans.', args: [NAME], kw: 'profession job' },
    { id: 'classplan', cat: 'level', kind: 'swarm', title: 'Class plan status (report)', tpl: '!classplan[ {name}]', handler: 'self', targets: PT, def: 'party', safety: 'safe',
      desc: 'Each character says its class plan in party chat: missing / needs-approval / waiting <class> @<level> / ready <class> / done, with the path. Plans are made and approved on the Classes page.', args: [NAME], kw: 'profession job class plan approve' },

    // ---------------- Raids / Kamaloka ----------------
    { id: 'raid', cat: 'raid', kind: 'swarm', title: 'Raid a boss', tpl: '!mission raid {boss}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'Travel, clear the area, countdown, pull. Never escapes: fights to the end.', args: [{ key: 'boss', label: 'Raid boss', type: 'boss' }], kw: 'mission boss kill' },
    { id: 'scout', cat: 'raid', kind: 'swarm', title: 'Scout: is the boss up?', tpl: '!scout {boss}[ {name}]', handler: 'self', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'ONE character travels alone to a safe look-out (epics: the guide route, Core = Cruma floors + the Cubic; else teleport near + walk), looks for the boss, writes Logs/raid_status.json (alive / not there; the boss page badge + the raid hunt use it) and Logs/scout_<name>.json, reports in party chat and goes back with .townname — never fights. No name = the leader picks the most expendable free member; never the leader of a busy party.',
      args: [{ key: 'boss', label: 'Raid boss (name or id)', type: 'boss' }, { key: 'name', label: 'Character (empty = the leader picks one)', type: 'char', optional: true }], kw: 'scout look check up alive epic core orfen queen ant' },
    { id: 'kamaloka', cat: 'raid', kind: 'swarm', title: 'Kamaloka', tpl: '!mission kamaloka[ {lvl}]', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'Run a Kamaloka (empty = the one that fits).', args: [{ key: 'lvl', label: 'Kamaloka', type: 'kamaloka', optional: true }], kw: 'instance hall labyrinth' },
    { id: 'missionstop', cat: 'raid', kind: 'swarm', title: 'Stop mission', tpl: '!mission stop', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Abort the running mission trip.' },
    { id: 'raidhunt', cat: 'raid', kind: 'swarm', title: 'Raid hunter', tpl: '!raidhunt[ {min} {max}]', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'Take the bosses that fit, lowest first, until a wipe/timeout. Optional level range.', args: [{ key: 'min', label: 'Boss level from', type: 'number', optional: true, def: 1 }, { key: 'max', label: 'to', type: 'number', optional: true, def: 99 }] },   // defs: one empty field dropped BOTH (CMDFIX2)
    { id: 'raidhuntstop', cat: 'raid', kind: 'swarm', title: 'Stop raid hunter', tpl: '!raidhunt stop', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'During a fight: after the current boss.' },
    { id: 'formation', cat: 'move', kind: 'swarm', title: 'Formation in town', tpl: '!formation[ {shape}]', handler: 'leader', targets: ['party', 'all'], def: 'party', safety: 'confirm',
      desc: 'The party lines up in front of the town landing, side by side (each party its own lane): tank in front, casters, healers at the back. Leveling stops and the members hold their slots until the next order. Scripts/data/formations.json sets the spot.',
      args: [{ key: 'shape', label: 'Shape (empty = rows)', type: 'select', optional: true, options: ['rows', 'wedge', 'line', 'grid', 'widegrid', 'slant', 'triangle', 'brick', 'zigzag', 'chevron', 'arrow', 'x'] }], kw: 'line up formation giran landing' },
    { id: 'hunthere', cat: 'move', kind: 'swarm', title: 'Hunt here 24/7', tpl: '!hunthere[ {radius}]', handler: 'leader', targets: ['party', 'all'], def: 'party', safety: 'confirm',
      desc: 'The party hunts around the spot where its leader stands now, around the clock: no supply runs, no Giran regroups, no daily Kamaloka. After a death it comes back here. "!hunthere off" = back to the automatic spots. Not inside a town.', args: [{ key: 'radius', label: 'Radius (800-6000, default 2500)', type: 'text', optional: true }], kw: 'hunt here stay 24/7 nonstop farm forever no town' },
    { id: 'hunthereoff', cat: 'move', kind: 'swarm', title: 'Hunt here 24/7: off', tpl: '!hunthere off', handler: 'leader', targets: ['party', 'all'], def: 'party', safety: 'confirm',
      desc: 'Ends Hunt here 24/7 and restores the spot choice from before it (or the automatic spots). A party without Hunt here keeps its choice (answers "was not on").', kw: 'hunt here off auto' },
    { id: 'nonstop', cat: 'move', kind: 'swarm', title: 'Nonstop (no town trips)', tpl: '!nonstop {onoff}', handler: 'leader', targets: ['party', 'all'], def: 'party', safety: 'confirm',
      desc: 'on = the party never goes to town by itself (no supply runs, no Giran regroup before leveling or between hunting spots, no daily Kamaloka); off = normal. Works with any hunting spot.', args: [{ key: 'onoff', label: 'Nonstop', type: 'onoff', def: 'on' }], kw: 'nonstop skip giran restock supply direct hunting' },
    { id: 'jointraid', cat: 'raid', kind: 'swarm', title: 'Joint raid (several parties)', tpl: '!jointraid {boss} with {parties}[ cc {cc}]', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'Order the MAIN party: it leads, the listed parties join on the same boss (optional Command Channel leader).',
      args: [{ key: 'boss', label: 'Raid boss', type: 'boss' }, { key: 'parties', label: 'Other parties', type: 'parties' }, { key: 'cc', label: 'Command Channel leader', type: 'party', optional: true }] },
    { id: 'routetest', cat: 'raid', kind: 'swarm', title: 'Route test to a boss (no raid)', tpl: '!routetest {boss}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Everyone .townname, then walks the boss\'s saved route.', args: [{ key: 'boss', label: 'Raid boss', type: 'boss' }] },
    { id: 'loot', cat: 'raid', kind: 'swarm', title: 'Loot the ground', tpl: '!loot', handler: 'each', targets: PT, def: 'party', safety: 'confirm', desc: 'Members pick up everything within 1500 (60 s), e.g. after a raid.' },
    { id: 'raidbuff', cat: 'raid', kind: 'swarm', title: 'Boss rebuff wave', tpl: '!raidbuff', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Buff wave without stopping (doomcryer Buff Party + casters Mystic).' },
    { id: 'draintest', cat: 'raid', kind: 'swarm', title: 'Destroyer drain test', tpl: '!draintest', handler: 'each', targets: ['party'], def: 'party', safety: 'confirm', desc: 'TEST outside a town: destroyers drain each other < 30 % then Frenzy & co; healers wait.' },

    // ---------------- Clan / Sieges ----------------
    { id: 'clanlevel', cat: 'clan', kind: 'swarm', title: 'Clan level up now', tpl: '!clanlevel', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', desc: 'The clan leader raises the clan level if SP/adena/items allow.' },
    { id: 'clanlevelauto', cat: 'clan', kind: 'swarm', title: 'Clan level automatic on/off', tpl: '!clanlevel auto {on}', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Automatic clan level-ups.', args: [{ key: 'on', label: 'Automatic', type: 'onoff', def: 'on' }] },
    { id: 'clanquest', cat: 'clan', kind: 'swarm', title: 'Clan quest step', tpl: '!clanquest {quest}[ {step}]', handler: 'clanleader', targets: ['char', 'party'], def: 'char', safety: 'confirm',
      desc: 'Run the next (or a given) step of a clan level quest; "reset" starts over. Hunt steps are run by a party leader.', args: [{ key: 'quest', label: 'Quest', type: 'clanquest' }, { key: 'step', label: 'Step number or "reset" (empty = next)', type: 'text', optional: true }] },
    // CLANHAND 2026-10-13: a clan level item (Blood Mark / Alliance Manifesto / Seal of Aspiration) from the character holding it to the clan leader
    { id: 'clanhand', cat: 'clan', kind: 'swarm', title: 'Clan level item to the clan leader now', tpl: '!clanhand', handler: 'each', nameForChar: true, targets: ['char', 'chars', 'party'], def: 'char', safety: 'confirm',
      desc: 'The character walks / ports to the clan leader and trades him the item the NEXT clan level needs (only as many as he still lacks). Automatic by itself when both are in a town (Clan tab switch "Clan level item hand-over"); this sends it now, wherever he is. Never in a raid / mission / instance / quest / another order of yours.', kw: 'blood mark clan level item trade handover leader' },
    { id: 'clanskill', cat: 'clan', kind: 'swarm', title: 'Learn the clan focus skill', tpl: '!clanskill', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', desc: 'The clan leader learns the focus skill picked on the Clan tab at a village master (here or Gesto / Kusto / Angus in Giran); every clan skill needs clan level 5+.' },
    { id: 'clanwh', cat: 'clan', kind: 'swarm', title: 'Look in the clan warehouse', tpl: '!clanwh', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', desc: 'The clan leader stops leveling, goes to the Giran warehouse, opens the clan warehouse and reports what is in it, then levels again.' },
    { id: 'clancreate', cat: 'clan', kind: 'swarm', title: 'Create the clan', tpl: '!clancreate', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', hidden: true, hideWhy: 'the clan MyClan exists (it answers "already in a clan"); the Clan tab shows its own button when there is no clan', desc: 'Only when there is no clan yet (the code refuses a second clan).' },
    { id: 'siegeplan', cat: 'clan', kind: 'swarm', title: 'Siege: run a saved plan now', tpl: '!siege plan {plan}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Order the plan\'s main (CC) party. Plans: Fortresses / Castles tab.', args: [{ key: 'plan', label: 'Plan', type: 'siegeplan' }] },
    { id: 'siegefort', cat: 'clan', kind: 'swarm', title: 'Siege a fortress now', tpl: '!siege fort {fort}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Ad-hoc fortress siege with this party. Warns in party chat when the clan level (4) or the registration is missing, then goes anyway. UNTESTED.', args: [{ key: 'fort', label: 'Fortress', type: 'fort' }] },
    { id: 'siegecastle', cat: 'clan', kind: 'swarm', title: 'Siege a castle now', tpl: '!siege castle {castle}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Ad-hoc castle siege with this party. Warns when the clan level (5) or the registration is missing; the clan leader travels to the Holy Artifact himself to engrave. UNTESTED.', args: [{ key: 'castle', label: 'Castle', type: 'castle' }] },
    { id: 'siegestop', cat: 'clan', kind: 'swarm', title: 'Stop the siege', tpl: '!siege stop', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Stop a running siege (also one still waiting for the team, and the flag carrier / engraver).' },
    { id: 'siegeregfort', cat: 'clan', kind: 'swarm', title: 'Register for a fortress siege', tpl: '!siegereg fort {fort}', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', desc: 'The clan leader registers at the Suspicious Merchant (the first clan pays 250,000 adena).', args: [{ key: 'fort', label: 'Fortress', type: 'fort' }] },
    { id: 'siegeregcastle', cat: 'clan', kind: 'swarm', title: 'Register for a castle siege', tpl: '!siegereg castle {castle}', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', desc: 'The clan leader registers at the castle Messenger.', args: [{ key: 'castle', label: 'Castle', type: 'castle' }] },

    // ---------------- Seven Signs ----------------
    { id: 'dawn', cat: 'signs', kind: 'swarm', title: 'Sign up with the Lords of Dawn', tpl: '!dawn', handler: 'leader', nameForChar: true, targets: ['party', 'all', 'clan', 'char', 'chars'], def: 'party', safety: 'confirm', desc: 'Your order (works whether enrolled on the 7 Signs tab or not): a party = the leader takes the team to the Priest of Dawn in Giran; a character = "!dawn <name>", only that character goes (a party leader takes his party along to Giran, but only he signs up). Always Dawn, never Dusk. No trip during a raid / mission / instance, in the seal validation period or when everyone is signed up already (it says so); a character in a quest is skipped; leveling resumes afterwards. Automatic sign-ups: only parties / characters enrolled on the 7 Signs tab.', kw: 'seven signs catacomb dawn enroll' },

    // ---------------- Bot control ----------------
    { id: 'b_enablebot', cat: 'bot', kind: 'bot', title: 'Bot ON', tpl: '/enablebot', targets: PT, def: 'char', safety: 'confirm', desc: 'Enable the L2Swarm bot (follow, assist, auto skills).' },
    { id: 'b_disablebot', cat: 'bot', kind: 'bot', title: 'Bot OFF', tpl: '/disablebot', targets: PT, def: 'char', safety: 'confirm', desc: 'Disable the L2Swarm bot (the script keeps running).' },
    { id: 'b_startpoints', cat: 'bot', kind: 'bot', title: 'Start route points', tpl: '/startpoints', targets: PT, def: 'char', safety: 'confirm', desc: 'L2Swarm route points on.' },
    { id: 'b_stoppoints', cat: 'bot', kind: 'bot', title: 'Stop route points', tpl: '/stoppoints', targets: PT, def: 'char', safety: 'confirm', desc: 'L2Swarm route points off.' },
    { id: 'b_runmacro', cat: 'bot', kind: 'bot', title: 'Run a macro', tpl: '/runmacro {name}', targets: PT, def: 'char', safety: 'confirm', hidden: true, hideWhy: 'no account has an L2Swarm macro (every LocalMacros list is empty): nothing to run',
      desc: 'Run an L2Swarm macro by name (LocalMacros in the account XML; none are defined today).', args: [{ key: 'name', label: 'Macro', type: 'text' }] },
    { id: 'b_configset', cat: 'bot', kind: 'bot', title: 'Config: set a value', tpl: '/config set {key} {value}', re: /^\/config\s+set\b/i, targets: ['char', 'chars', 'party'], def: 'char', safety: 'destructive',
      desc: 'Live config change (then "Config: save" to keep it). Passwords can never be set here.', args: [{ key: 'key', label: 'Property (as in the XML)', type: 'text', placeholder: 'FollowDistance' }, { key: 'value', label: 'Value', type: 'text' }] },
    { id: 'b_configsave', cat: 'bot', kind: 'bot', title: 'Config: save', tpl: '/config save', re: /^\/config\s+save\s*$/i, targets: ['char', 'chars', 'party'], def: 'char', safety: 'confirm', desc: 'Save the live config to its own XML (never to another file).' },
    { id: 'b_configload', cat: 'bot', kind: 'bot', title: 'Config: load XML', tpl: '/config load {file}', re: /^\/config\s+load\b/i, targets: ['char'], def: 'char', safety: 'destructive', desc: 'Load a config file from Settings (must be this character\'s own file: usually named after the LOGIN, e.g. Mylogin60.xml for Spoiler6; the server checks it). Never tested on 3.8.14.', args: [{ key: 'file', label: 'XML in Settings (the account\'s own file)', type: 'text', placeholder: 'e.g. Mylogin60.xml (login name, not the character)' }] },

    // ---------------- Client mode / Account ----------------
    { id: 'a_ingame', cat: 'client', kind: 'action', action: 'clientmode', mode: 'ingame', title: 'In-game (l2.exe client)', tpl: 'client mode: in-game', targets: ['char'], def: 'char', safety: 'confirm', desc: 'L2Swarm Hook: logs out, starts l2.exe, logs in through the client (~2 min, 1-2 GB RAM). Only ONE hooked client at a time.' },
    { id: 'a_oog', cat: 'client', kind: 'action', action: 'clientmode', mode: 'oog', title: 'Out of game (no client)', tpl: 'client mode: out of game', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Close the l2.exe client and play out of game again.' },
    { id: 'a_logout', cat: 'client', kind: 'action', tpl: '@logout', title: 'Log out (close the account)', targets: ['char', 'chars'], def: 'char', safety: 'destructive', desc: 'MCP close_account: the character leaves the game; a character left in a hunting ground stays in the world and can die.' },
    { id: 'a_login', cat: 'client', kind: 'action', tpl: '@login', title: 'Log in (open the account)', targets: ['char', 'chars'], def: 'char', safety: 'confirm', desc: 'MCP open_account with the character\'s config file.' },

    // ---------------- PC / L2Swarm ----------------
    { id: 'p_start', cat: 'pc', kind: 'action', action: 'system', sys: 'start', title: 'Start L2Swarm', tpl: 'L2Swarm start', targets: ['none'], def: 'none', safety: 'confirm', desc: 'Through the elevated task; logs everyone in 20 s apart.' },
    { id: 'p_restart', cat: 'pc', kind: 'action', action: 'system', sys: 'restart', title: 'Restart L2Swarm', tpl: 'L2Swarm restart', targets: ['none'], def: 'none', safety: 'destructive', desc: 'Every restart costs ~4 min of logins and breaks raids. Never during a raid/Kamaloka.' },
    { id: 'p_stop', cat: 'pc', kind: 'action', action: 'system', sys: 'stop', title: 'Stop L2Swarm', tpl: 'L2Swarm stop', targets: ['none'], def: 'none', safety: 'destructive', desc: 'Everyone goes offline. Send the parties to a town first.' },
    { id: 'p_deploy', cat: 'pc', kind: 'action', action: 'system', sys: 'deploy', title: 'Deploy swarm.js', tpl: 'deploy swarm.js', targets: ['none'], def: 'none', safety: 'destructive', desc: 'Copies Scripts_dev/swarm.js to Scripts/swarm.js after a syntax check (refused within 15 min of the last deploy, during a live raid / Kamaloka, or while accounts log in; "no changes" = nothing done). L2Swarm reloads it on every account (memory per reload); the brain pool reloads it party by party (--watch-script). Never restarts L2Swarm.' },

    // ---------------- Debug / Reports ----------------
    { id: 'escapetest', cat: 'debug', kind: 'swarm', title: 'Escape test (no teleport)', tpl: '!escapetest[ {name}]', handler: 'each', targets: ['char', 'party'], def: 'char', safety: 'confirm',
      desc: 'Runs the real escape on one character in TEST mode: CC on the nearest monster (only within 900), run to the nearest safe spot, wait for no hits, then STOPS before .townname / Scroll of Escape. Live escape box + map on the Parties tab; result in Logs/escape.log. Refused in raids / Kamaloka / missions and below 70 % HP. No name = the target character (party target = its leader).',
      args: [{ key: 'name', label: 'Character (empty = the one the order goes to)', type: 'char', optional: true }], kw: 'escape flee cc safe spot soe test' },
    { id: 'escapetestfull', cat: 'debug', kind: 'swarm', title: 'Escape test FULL (.townname / Scroll of Escape)', tpl: '!escapetest {name} full', re: /^!escapetest\b.*\bfull\b/i, handler: 'each', targets: ['char', 'party'], def: 'char', safety: 'destructive',
      desc: 'Like "Escape test" but goes all the way: .townname, and a Scroll of Escape when .townname is refused — the character ends up in a town.',
      args: [{ key: 'name', label: 'Character', type: 'char' }], kw: 'escape flee soe test full' },
    { id: 'dumpskills', cat: 'debug', kind: 'swarm', title: 'Dump skills to a file', tpl: '!dumpskills', handler: 'each', targets: PT, def: 'char', safety: 'safe', desc: '-> Logs/skills_<name>.json' },
    { id: 'b_loc', cat: 'debug', kind: 'bot', title: 'Location (/loc)', tpl: '/loc', targets: PT, def: 'char', safety: 'safe', desc: 'Prints the position in the bot log.' },
    { id: 'b_time', cat: 'debug', kind: 'bot', title: 'Game time', tpl: '/time', targets: ['char'], def: 'char', safety: 'safe', desc: 'Server time message.' },
    { id: 'b_instancezone', cat: 'debug', kind: 'bot', title: 'Instance zone info', tpl: '/instancezone', targets: PT, def: 'char', safety: 'safe', desc: 'Which instances are locked (Kamaloka re-entry times).' },

    // ---------------- Legacy (exist in swarm.js, mostly switched off in the leader-controlled design) ----------------
    { id: 'farm', cat: 'legacy', hidden: true, hideWhy: 'old farm mode: the idle watchdog takes the party back to leveling after 3 min, no puller in parties without an sk, healers start combat (use Leveling / Hunt here)', kind: 'swarm', title: 'Farm at the camp point', tpl: '!farm', handler: 'each', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Old farm mode: tank pulls to the camp, others fight in a box (set the camp first).' },
    { id: 'camp', cat: 'legacy', hidden: true, hideWhy: 'only for the old !farm (hidden); a solo party never sets it, it is forgotten at every reload', kind: 'swarm', title: 'Camp here (leader position)', tpl: '!camp', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'The leader broadcasts his position as the camp point.' },
    { id: 'setcamp', cat: 'legacy', kind: 'swarm', title: 'Set camp point', tpl: '!setcamp {x} {y} {z}', handler: 'each', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Camp point by coordinates.', args: [{ key: 'x', label: 'x', type: 'number' }, { key: 'y', label: 'y', type: 'number' }, { key: 'z', label: 'z', type: 'number' }] },
    { id: 'go', cat: 'legacy', hidden: true, hideWhy: 'old raid prep: waits for every destroyer of ALL parties, so it never ends and the party stays in raid prep until !stop (use Raid a boss)', kind: 'swarm', title: 'Raid prep (!go)', tpl: '!go[ {boss}]', handler: 'each', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Old raid prep: destroyers drain + Frenzy, then the leader posts !raid. Use "Raid a boss" instead.', args: [{ key: 'boss', label: 'Boss', type: 'boss', optional: true }] },
    { id: 'raidold', cat: 'legacy', hidden: true, hideWhy: 'old raid sequence: stays in raid mode after the kill / when the boss is not here, until !stop (use Raid a boss)', kind: 'swarm', title: 'Raid sequence now (!raid)', tpl: '!raid[ {boss}]', handler: 'each', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Old: every role runs its raid routine at the current spot.', args: [{ key: 'boss', label: 'Boss', type: 'boss', optional: true }] },
    { id: 'career', cat: 'legacy', hidden: true, hideWhy: 'switched off in the leader-controlled design (answers "switched off")', kind: 'swarm', title: 'Career (solo 1-40)', tpl: '!career', handler: 'each', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Off in leader mode (answers "switched off").' },
    { id: 'escort', cat: 'legacy', hidden: true, hideWhy: 'switched off in the leader-controlled design (answers "switched off"); class quests removed 2026-10-03', kind: 'swarm', title: 'Class-quest escort', tpl: '!escort', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Off in leader mode; class quests removed 2026-10-03.' },
    // ---------------- Quests (QENGINE 2026-10-12: the generic quest engine in swarm.js, page #/quests, doc docs/plan/quests.md) ----------------
    // PARTY PLAN 2026-10-13 (Dashboard/partyplan.js "📋 Plan" sends these through /api/partyplans action control): the party's plan (Scripts/data/party_plans.json)
    { id: 'planstart', cat: 'level', kind: 'swarm', title: 'Plan: go on (switch ON + run the plan)', tpl: '!plan start', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'Switches the party ON and runs its plan from the current step (the plan must be switched on in 📋 Plan). Also "Try again" after a step stopped.', kw: 'plan steps continue resume go on retry' },
    { id: 'plannext', cat: 'level', kind: 'swarm', title: 'Plan: continue / skip this step', tpl: '!plan next', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'Marks the current plan step as done (a "wait for my order" step: continue) and goes on with the next one.', kw: 'plan skip continue next step' },
    { id: 'planstop', cat: 'level', kind: 'swarm', title: 'Plan: pause', tpl: '!plan stop', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'Pauses the plan (what the step does now stops); "!plan start" goes on with the same step.', kw: 'plan pause halt' },
    { id: 'plangoto', cat: 'level', kind: 'swarm', title: 'Plan: go to step…', tpl: '!plan goto {n}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'The plan goes on with that step (it and the steps after it count as not done again).', args: [{ key: 'n', label: 'Step number', type: 'number' }], kw: 'plan jump step' },
    { id: 'planrestart', cat: 'level', kind: 'swarm', title: 'Plan: start again from step 1', tpl: '!plan restart', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'Every plan step counts as not done again; the party begins at step 1 (when it is started).', kw: 'plan reset restart' },
    { id: 'planstatus', cat: 'level', kind: 'swarm', title: 'Plan: where is it?', tpl: '!plan status', handler: 'leader', targets: ['party'], def: 'party', safety: 'safe',
      desc: 'The leader says in party chat which plan step runs and how it goes.', kw: 'plan status report' },
    { id: 'quest', cat: 'quest', kind: 'swarm', title: 'Run a quest…', tpl: '!quest {quest}[ repeat {repeat}][ {mode}]', handler: 'each', nameForChar: true, targets: ['char', 'chars', 'party'], def: 'char', safety: 'confirm',
      desc: 'Runs any quest of the datapack (Scripts/data/quests) as a state machine: talk + links, hunt the drops / kills in the best spawn cluster, quest monsters through their trigger, hand-ins. Repeatable quests: repeat N times (forever = until stopped). solo = this character alone (a party member leaves follow; healers cannot hunt solo); party = only the party LEADER acts, the members follow, talk to the same NPCs and report their items (send it to the party / leader). A party target with solo = every member runs it alone. A newer order (!level, !town ...) ends it. State: Logs/quest_state_<Name>.json, page Quests.',
      args: [{ key: 'quest', label: 'Quest id or name', type: 'text', placeholder: '265  ·  Bonds of Slavery' }, { key: 'repeat', label: 'Repeat (repeatable quests): a number or "forever" — empty = once', type: 'text', optional: true, placeholder: '5  ·  forever' },
        { key: 'mode', label: 'Mode', type: 'select', options: [['solo', 'solo (this character alone)'], ['party', 'party (the leader drives, the party joins)']], def: 'solo' }], kw: 'quest repeat adena npc hunt turn in hand in' },
    { id: 'queststop', cat: 'quest', kind: 'swarm', title: 'Stop the quest', tpl: '!quest stop', handler: 'each', nameForChar: true, targets: PT, def: 'char', safety: 'confirm', desc: 'Ends the running quest run after the current step (a party leader also ends the party run). The quest itself stays in the quest log; run it again to continue.', kw: 'quest stop' },
    { id: 'queststatus', cat: 'quest', kind: 'swarm', title: 'Quest status', tpl: '!quest status', handler: 'each', nameForChar: true, targets: PT, def: 'char', safety: 'safe', desc: 'Each character says its running quest: phase, step, items, runs (party chat + notes).', kw: 'quest status' },
    { id: 'questfarm', cat: 'quest', kind: 'swarm', title: 'Quest farm status', tpl: '!questfarm', handler: 'each', nameForChar: true, targets: PT, def: 'char', safety: 'safe', desc: 'Quest farm (Scripts/data/quest_farm.json, set on the Quests page -> Quest farm): each farm character says on/off, runs, adena and adena/h, adena traded to the collector. Switching the farm on/off and picking characters happens on the page.', kw: 'quest farm adena collector' },
    { id: 'queststop_old', cat: 'legacy', hidden: true, hideWhy: 'old alias of "Stop the quest" (!quest stop)', kind: 'swarm', title: 'Stop quest (old)', tpl: '!queststop', handler: 'each', targets: PT, def: 'char', safety: 'confirm', desc: 'Same as !quest stop.' },
    { id: 'gear', cat: 'legacy', hidden: true, hideWhy: 'switched off in the leader-controlled design (answers "switched off")', kind: 'swarm', title: 'Gear share (!gear)', tpl: '!gear', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Off in leader mode.' },
    { id: 'shop', cat: 'legacy', hidden: true, hideWhy: 'switched off in the leader-controlled design (answers "switched off")', kind: 'swarm', title: 'Shop trip (!shop)', tpl: '!shop', handler: 'each', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Off in leader mode.' },
    { id: 'kamaold', cat: 'legacy', hidden: true, hideWhy: 'placeholder that only answers "not built" (use Raids -> Kamaloka)', kind: 'swarm', title: '!kamaloka (placeholder)', tpl: '!kamaloka', handler: 'each', targets: ['party'], def: 'party', safety: 'safe', desc: 'Old placeholder ("not built"); use Raids -> Kamaloka.' },
  ];

  const firstWord = (s) => String(s || '').trim().split(/[\s[{]+/)[0].toLowerCase();
  /** Fill a template: {k} -> value, "[ ... ]" kept only when every {k} inside has a value. */
  function build(tpl, args) {
    const a = args || {}, val = (k) => { const v = a[k]; return v == null ? '' : Array.isArray(v) ? v.join(',') : String(v).trim(); };
    let s = String(tpl).replace(/\[([^\]]*)\]/g, (m, inner) => { const keys = [...inner.matchAll(/\{(\w+)\}/g)].map(x => x[1]); return keys.every(k => val(k)) ? inner : ''; });
    s = s.replace(/\{(\w+)\}/g, (m, k) => val(k));
    return s.replace(/\s+/g, ' ').trim();
  }
  /** The catalog entry for a typed command (most specific: entries with a matching "re" win, then the longest fixed template prefix). */
  function classify(text) {
    const t = String(text || '').trim(), w = firstWord(t);
    const cand = C.filter(c => c.kind !== 'action' && firstWord(c.tpl) === w);
    const withRe = cand.filter(c => c.re && c.re.test(t)); if (withRe.length) return withRe[0];
    const plain = cand.filter(c => !c.re);
    let best = null, bl = -1;
    plain.forEach(c => { const fixed = String(c.tpl).split(/[[{]/)[0].trim().toLowerCase(); if (t.toLowerCase().startsWith(fixed) && fixed.length > bl) { best = c; bl = fixed.length; } });
    return best || plain[0] || null;
  }
  const SWARM_WORDS = [...new Set(C.filter(c => c.kind === 'swarm').map(c => firstWord(c.tpl)))];
  const BOT_WORDS = [...new Set(C.filter(c => c.kind === 'bot').map(c => firstWord(c.tpl)))];
  const API = { CATS, TOWNS, PARK, CABINET, CLANQ, COMMANDS: C, build, classify, firstWord, SWARM_WORDS, BOT_WORDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SWARM_COMMANDS = API;
})(typeof window !== 'undefined' ? window : globalThis);
