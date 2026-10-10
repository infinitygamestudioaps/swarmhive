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
//           char party parties fort castle siegeplan clanquest zmap item select
(function (root) {
  const CATS = [
    ['move', 'Move / Travel', 'icon/etc_scroll_of_return_i00'],
    ['fight', 'Fight', 'icon/action003'],
    ['party', 'Party', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Clan'],
    ['supply', 'Supply / Items', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Inventory'],
    ['level', 'Leveling / Spots', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Map'],
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
    'Block pet experience', 'Do not show traders', 'Disable Animations', 'Classic Shift', 'Master Account', 'Party', 'Same IP', 'Translit'];
  const CLANQ = [['bloodmark', 'Blood Mark (clan level 2 -> 3)'], ['501', 'Q501 Proof of Clan Alliance (3 -> 4)'], ['503', 'Q503 Pursuit of Clan Ambition (4 -> 5)']];
  const PT = ['party', 'char', 'all', 'clan', 'chars'];        // every target kind
  const NAME = { key: 'name', label: 'Only this character (empty = everyone who hears it)', type: 'char', optional: true };

  const C = [
    // ---------------- Move / Travel ----------------
    { id: 'town', cat: 'move', kind: 'swarm', title: 'Town teleport (.town)', tpl: '!town {town}', handler: 'leader', targets: PT, def: 'party', safety: 'confirm',
      desc: 'The leader stops hunting, fights off / steps away, regroups and uses .<town> (the server takes the party along). Giran = the safe regroup trip. A member alone ports itself only when the leader is gone.',
      args: [{ key: 'town', label: 'Town', type: 'town', def: 'Giran' }], kw: 'teleport giran gludio dion aden oren heine rune goddard schuttgart hunters gludin' },
    { id: 'gk', cat: 'move', kind: 'swarm', title: 'Gatekeeper teleport', tpl: '!gk {dest}', handler: 'leader', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Walk to the nearest gatekeeper and click the link containing this text (the leader clicks, the server brings the party, followers check).',
      args: [{ key: 'dest', label: 'Destination (link text)', type: 'gk', placeholder: 'Ruins of Agony' }], kw: 'teleport gatekeeper port' },
    { id: 'goto', cat: 'move', kind: 'swarm', title: 'Walk to…', tpl: '!goto {place}', handler: 'each', targets: PT, def: 'char', safety: 'confirm',
      desc: 'Walk to an NPC, a saved place (!mark) or "x y". Party target = every member walks.', args: [{ key: 'place', label: 'NPC / saved place / x y', type: 'text', placeholder: 'Helvetia  or  83473 148554' }], kw: 'walk move go' },
    { id: 'gotonpc', cat: 'move', kind: 'swarm', title: 'Go to an NPC (anywhere)…', tpl: '!goto npc {npc}', handler: 'leader', targets: PT, def: 'party', safety: 'confirm',
      desc: 'NPC atlas (Scripts/data/npc_atlas.json): the leader takes the party to the best matching NPC — .town to its town, the dungeon way in + room by room (floor teleporters on the way), or teleport near + walk — and opens its dialog. By id (#30487), name (Penelope), role (grocer, gatekeeper, warehouse, priest of dawn, class master, blacksmith … + optional town: "grocer dion") or what it offers ("teleport:Cruma Tower 2nd floor"). Add a character name at the end for that character alone.',
      args: [{ key: 'npc', label: 'NPC / role [town] / teleport:…', type: 'text', placeholder: 'grocer giran  ·  Penelope  ·  priest of dawn  ·  teleport:Cruma Tower 2nd floor' }], kw: 'npc find walk go priest grocer warehouse gatekeeper atlas' },
    { id: 'park', cat: 'move', kind: 'swarm', title: 'Park in Giran', tpl: '!park[ {place}]', handler: 'each', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Everyone stops, goes to Giran, walks the recorded route to the place and waits for orders (leveling stays paused).', args: [{ key: 'place', label: 'Place', type: 'park', def: 'grocer' }], kw: 'wait giran grocer warehouse' },
    { id: 'soe', cat: 'move', kind: 'swarm', title: 'Retreat (escape to town)', tpl: '!soe', handler: 'each', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Everyone (leader too) runs out of the fight and uses .townname (never a scroll). Not inside a raid: raids are fought to the end.', kw: 'escape flee run' },
    { id: 'regroup', cat: 'move', kind: 'swarm', title: 'Regroup (home, restock, back)', tpl: '!regroup', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'Old regroup: everyone home, restock, back together. In leader mode !level / !supply are the normal way.', kw: 'home' },
    { id: 'return', cat: 'move', kind: 'swarm', title: 'Return (restock in town, back together)', tpl: '!return', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Old regroup without going home first.' },
    { id: 'mark', cat: 'move', kind: 'swarm', title: 'Save leader position as a place', tpl: '!mark {name}', handler: 'leader', targets: ['party'], def: 'party', safety: 'safe',
      desc: 'The leader saves where he stands; "Walk to…" can use the name later.', args: [{ key: 'name', label: 'Place name', type: 'text', placeholder: 'Giran square' }] },
    { id: 'places', cat: 'move', kind: 'swarm', title: 'List saved places', tpl: '!places', handler: 'leader', targets: ['party'], def: 'party', safety: 'safe', desc: 'The leader lists the saved places in party chat.' },
    { id: 'b_moveto', cat: 'move', kind: 'bot', title: 'Move to x y (L2Swarm)', tpl: '/moveto {x} {y}[ {z}]', targets: PT, def: 'char', safety: 'confirm',
      desc: "L2Swarm's own move command (no team logic).", args: [{ key: 'x', label: 'x', type: 'number' }, { key: 'y', label: 'y', type: 'number' }, { key: 'z', label: 'z', type: 'number', optional: true }] },
    { id: 'b_run', cat: 'move', kind: 'bot', title: 'Run', tpl: '/run', targets: PT, def: 'char', safety: 'safe', desc: 'Switch to running.' },
    { id: 'b_walk', cat: 'move', kind: 'bot', title: 'Walk (slow)', tpl: '/walk', targets: PT, def: 'char', safety: 'confirm', desc: 'Switch to walking speed.' },
    { id: 'b_unstuck', cat: 'move', kind: 'bot', title: '/unstuck (to the nearest town)', tpl: '/unstuck', targets: ['char', 'chars'], def: 'char', safety: 'destructive',
      desc: 'Last resort: the server sends the character to a town after a long cast. Breaks off whatever it does.' },
    { id: 'navtest', cat: 'debug', kind: 'swarm', title: 'Navigation test', tpl: '!navtest {x} {y}[ {name}]', handler: 'each', targets: ['char', 'party'], def: 'char', safety: 'confirm',
      desc: 'Walk test with logging -> Logs/navtest_<name>.log (disables the bot for 60 s).', args: [{ key: 'x', label: 'x', type: 'number' }, { key: 'y', label: 'y', type: 'number' }, NAME] },

    // ---------------- Fight ----------------
    { id: 'stop', cat: 'fight', kind: 'swarm', title: 'STOP everything', tpl: '!stop', handler: 'each', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Everyone idle + stop combat. The leader stays stopped (no auto-leveling) until the next order.', kw: 'halt pause idle' },
    { id: 'kill', cat: 'fight', kind: 'swarm', title: 'Kill a monster by name', tpl: '!kill {name}', handler: 'each', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Everyone who hears it attacks the nearest monster with that name (within 4000).', args: [{ key: 'name', label: 'Monster name', type: 'text', placeholder: 'Bifrons' }], kw: 'attack' },
    { id: 'assist', cat: 'fight', kind: 'swarm', title: 'Help a character (party goes there)', tpl: '!assist {who}', handler: 'leader', targets: PT, def: 'party', safety: 'confirm',
      desc: 'The leader takes the team to that character and hunts around him until "!assist off".', args: [{ key: 'who', label: 'Character to help', type: 'char' }], kw: 'help follow' },
    { id: 'assistoff', cat: 'fight', kind: 'swarm', title: 'Stop helping (normal spots)', tpl: '!assist off', handler: 'leader', targets: PT, def: 'party', safety: 'confirm', desc: 'Back to the normal hunting spots / follow the leader.' },
    // USER OVERRIDE (user 2026-10-09 09:50: "an override button to ask a person to cast a skill or take a mana potion etc." + "direct orders on the character page"): one action, ONCE, any time,
    // on ONE character, even mid-raid (swarm.js raidOverride). The name is part of the command: party chat reaches the whole party, only that
    // character's window acts. Result: Logs/override_<name>.json -> toast on the live raid view. Also on every team card of the live raid view.
    { id: 'ovcast', cat: 'fight', kind: 'swarm', title: 'Override: cast a skill', tpl: '!ov {name} cast {skill}[ {on}]', re: /^!ov\s+\S+\s+cast\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character casts the skill once (skill id), on: boss | focus | self | <teammate> (default: its target / the boss).',
      args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'skill', label: 'Skill id', type: 'number', placeholder: '1015' }, { key: 'on', label: 'On (boss / focus / self / name)', type: 'text', optional: true, placeholder: 'boss' }], kw: 'override skill cast heal nuke' },
    { id: 'ovuse', cat: 'fight', kind: 'swarm', title: 'Override: use an item', tpl: '!ov {name} use {item}', re: /^!ov\s+\S+\s+use\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character uses the item once (item id): Mana Potion 728, Greater Healing Potion 1061 (and 1539), CP potions, scrolls.',
      args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'item', label: 'Item id', type: 'number', placeholder: '728' }], kw: 'override potion mana item' },
    { id: 'ovtarget', cat: 'fight', kind: 'swarm', title: 'Override: target', tpl: '!ov {name} target {on}', re: /^!ov\s+\S+\s+target\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character selects boss | focus | <name> (a teammate or a monster in sight).', args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'on', label: 'Target', type: 'text', placeholder: 'boss' }], kw: 'override select' },
    { id: 'ovattack', cat: 'fight', kind: 'swarm', title: 'Override: attack', tpl: '!ov {name} attack[ {on}]', re: /^!ov\s+\S+\s+attack\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character attacks boss | focus | <monster> (default: the focus, else the boss).', args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'on', label: 'Target', type: 'text', optional: true, placeholder: 'focus' }], kw: 'override hit' },
    { id: 'ovstop', cat: 'fight', kind: 'swarm', title: 'Override: stop attacking', tpl: '!ov {name} stop', re: /^!ov\s+\S+\s+stop\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character stops its attack / cast and drops the target once (its raid routine may pick a target again).', args: [{ key: 'name', label: 'Character', type: 'char' }], kw: 'override cancel' },
    { id: 'ovmove', cat: 'fight', kind: 'swarm', title: 'Override: move to', tpl: '!ov {name} move {to}', re: /^!ov\s+\S+\s+move\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character walks next to tank | boss | <teammate>.', args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'to', label: 'To (tank / boss / name)', type: 'text', placeholder: 'tank' }], kw: 'override walk' },
    { id: 'ovres', cat: 'fight', kind: 'swarm', title: 'Override: resurrect a teammate', tpl: '!ov {name} res {who}', re: /^!ov\s+\S+\s+res\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character resurrects the dead teammate (its res skill; a Scroll of Resurrection only when it has no res skill).', args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'who', label: 'Dead teammate', type: 'char' }], kw: 'override rez resurrect' },
    { id: 'ovsoe', cat: 'fight', kind: 'swarm', title: 'Override: Scroll of Escape NOW', tpl: '!ov {name} soe', re: /^!ov\s+\S+\s+soe\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'confirm',
      desc: 'That character reads a Scroll of Escape at once (an explicit order; the bots themselves only use .townname). A hit can interrupt the cast.', args: [{ key: 'name', label: 'Character', type: 'char' }], kw: 'override escape soe town' },
    { id: 'ovdrop', cat: 'fight', kind: 'swarm', title: 'Override: DROP an item', tpl: '!ov {name} drop {obj}[ {count}]', re: /^!ov\s+\S+\s+drop\b/i, handler: 'self', targets: ['char'], def: 'char', safety: 'destructive',
      desc: 'That character drops the item (inventory OBJECT id) on the ground. Never equipped or quest items (it refuses). Destructive: typed YES.', args: [{ key: 'name', label: 'Character', type: 'char' }, { key: 'obj', label: 'Item object id', type: 'number' }, { key: 'count', label: 'How many (empty = all)', type: 'number', optional: true }], kw: 'override drop throw away' },
    { id: 'buff', cat: 'fight', kind: 'swarm', title: 'Rebuff (board buffs, one at a time)', tpl: '!buff', handler: 'each', targets: PT, def: 'party', safety: 'confirm', desc: 'Forced rebuff queue; characters that already have their buffs skip it.', kw: 'buffs' },
    { id: 'buffauto', cat: 'fight', kind: 'swarm', title: 'Auto-rebuff on/off', tpl: '!buffauto {on}', handler: 'each', targets: PT, def: 'party', safety: 'confirm', desc: 'Automatic rebuff rotation on or off (until a script reload).', args: [{ key: 'on', label: 'Auto-rebuff', type: 'onoff', def: 'on' }] },
    { id: 'zone', cat: 'fight', kind: 'swarm', title: 'Fight in a .zmap zone', tpl: '!zone {file}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'The leader loads a Settings\\<file>.zmap as its combat zone.', args: [{ key: 'file', label: 'Zone file in Settings', type: 'zmap', placeholder: 'fightzone_under20.zmap' }] },
    { id: 'b_attack', cat: 'fight', kind: 'bot', title: 'Attack target', tpl: '/attack', targets: PT, def: 'char', safety: 'confirm', desc: 'Attack the current target (L2Swarm).' },
    { id: 'b_attackforce', cat: 'fight', kind: 'bot', title: 'Force attack target', tpl: '/attackforce', targets: ['char', 'chars'], def: 'char', safety: 'destructive', desc: 'Force attack (works on players: PvP flag / karma risk).' },
    { id: 'b_attackround', cat: 'fight', kind: 'bot', title: 'Attack around', tpl: '/attackround', targets: PT, def: 'char', safety: 'confirm', desc: 'Attack monsters around (L2Swarm).' },
    { id: 'b_target', cat: 'fight', kind: 'bot', title: 'Target by name', tpl: '/target {name}', targets: PT, def: 'char', safety: 'confirm', desc: 'Select a target by name.', args: [{ key: 'name', label: 'Name', type: 'text' }] },
    { id: 'b_startcombat', cat: 'fight', kind: 'bot', title: 'Start L2Swarm combat', tpl: '/startcombat', targets: PT, def: 'char', safety: 'confirm',
      desc: "L2Swarm's own combat loop. Members use script attacks since the 2026-10-08 deadlock (patch v6 installed, still careful)." },
    { id: 'b_stopcombat', cat: 'fight', kind: 'bot', title: 'Stop L2Swarm combat', tpl: '/stopcombat', targets: PT, def: 'char', safety: 'confirm', desc: "Stop L2Swarm's combat loop." },
    { id: 'b_sit', cat: 'fight', kind: 'bot', title: 'Sit', tpl: '/sit', targets: PT, def: 'char', safety: 'confirm', desc: 'Sit down (a sitting character cannot walk).' },
    { id: 'b_stand', cat: 'fight', kind: 'bot', title: 'Stand up', tpl: '/stand', targets: PT, def: 'char', safety: 'safe', desc: 'Stand up.' },

    // ---------------- Party ----------------
    { id: 'status', cat: 'party', kind: 'swarm', title: 'Status report', tpl: '!status', handler: 'each', targets: PT, def: 'party', safety: 'safe', desc: 'Everyone reports role, mode, HP/MP, buffs in party chat.', kw: 'report' },
    { id: 'collect', cat: 'party', kind: 'swarm', title: 'Collect adena to the leader', tpl: '!collect', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'Members trade adena above their keep (2M <40, 2.5M 40-75, 3M 76+) to their leader (team trades are pre-approved).', kw: 'money' },
    { id: 'cabinet', cat: 'party', kind: 'swarm', title: 'Cabinet setting on/off', tpl: '!cabinet {setting} {on}', handler: 'each', targets: PT, def: 'party', safety: 'confirm',
      desc: 'Alt+B -> Cabinet -> Settings: toggle a row (e.g. Forward Drop).', args: [{ key: 'setting', label: 'Setting', type: 'cabinet', def: 'Forward Drop' }, { key: 'on', label: 'Value', type: 'onoff', def: 'on' }], kw: 'forward drop settings' },
    { id: 'b_partyinfo', cat: 'party', kind: 'bot', title: 'Party info', tpl: '/partyinfo', targets: PT, def: 'char', safety: 'safe', desc: "L2Swarm party info (shows in the bot's log)." },
    { id: 'b_invite', cat: 'party', kind: 'bot', title: 'Invite to party', tpl: '/invite {name}', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Invite a player to this character\'s party (the bots re-invite their own team by themselves).', args: [{ key: 'name', label: 'Player', type: 'char' }] },
    { id: 'b_leave', cat: 'party', kind: 'bot', title: 'Leave party', tpl: '/leave', targets: ['char', 'chars'], def: 'char', safety: 'destructive', desc: 'Leave the party (the leader re-invites teammates within ~10 s).' },
    { id: 'b_socialyes', cat: 'party', kind: 'bot', title: 'Social: yes', tpl: '/socialyes', targets: PT, def: 'char', safety: 'safe', desc: 'Social action.' },
    { id: 'b_socialdance', cat: 'party', kind: 'bot', title: 'Social: dance', tpl: '/socialdance', targets: PT, def: 'char', safety: 'safe', desc: 'Social action.' },
    { id: 'b_socialhello', cat: 'party', kind: 'bot', title: 'Social: hello', tpl: '/socialhello', targets: PT, def: 'char', safety: 'safe', desc: 'Social action.' },
    { id: 'b_ignore', cat: 'party', kind: 'bot', title: 'Ignore a player', tpl: '/ignore {name}', targets: ['char', 'chars'], def: 'char', safety: 'confirm', desc: 'Block a player\'s chat.', args: [{ key: 'name', label: 'Player', type: 'text' }] },
    { id: 'b_trade', cat: 'party', kind: 'bot', title: 'Trade with target', tpl: '/trade', targets: ['char'], def: 'char', safety: 'destructive', desc: 'Open a trade with the current target. Trades with players outside our teams need your OK.' },

    // ---------------- Supply / Items ----------------
    { id: 'supply', cat: 'supply', kind: 'swarm', title: 'Supply run (Giran)', tpl: '!supply', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'Leader takes the team to Giran, buys SoE/SoR/shots/spirit ore/potions for everyone at Helvetia and hands it out (also gear upgrades + enchants when enabled).', kw: 'restock buy shots scrolls' },
    { id: 'restock', cat: 'supply', kind: 'swarm', title: 'Restock (= supply in leader mode)', tpl: '!restock', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Same as Supply in the leader-controlled design.' },
    { id: 'sell', cat: 'supply', kind: 'swarm', title: 'Sell marked items + junk', tpl: '!sell[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'confirm',
      desc: 'Walk to the nearest merchant (towns only) and sell what Scripts/data/sell_list.json marks + junk.', args: [NAME] },
    { id: 'gearup', cat: 'supply', kind: 'swarm', title: 'Better gear now', tpl: '!gearup[ {name}]', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'Leader takes the team to Giran; everyone (or only <name>) buys + puts on the upgrades, then leveling resumes.', args: [{ key: 'name', label: 'Only this character (empty = everyone)', type: 'char', optional: true }], kw: 'upgrade gear armor weapon' },
    { id: 'gearplan', cat: 'supply', kind: 'swarm', title: 'Gear plan (dry run)', tpl: '!gearplan[ {name}]', handler: 'self', targets: PT, def: 'party', safety: 'safe', desc: 'What each would buy (never buys) -> Logs/gear_plan_<name>.json + party chat.', args: [NAME] },
    { id: 'upgrade', cat: 'supply', kind: 'swarm', title: 'Buy + wear upgrades here (in Giran)', tpl: '!upgrade[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'confirm', desc: 'Must stand in Giran. Buys and equips the planned upgrades.', args: [NAME] },
    { id: 'stash', cat: 'supply', kind: 'swarm', title: 'Warehouse: deposit what I do not use', tpl: '!stash[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'confirm',
      desc: 'Private warehouse at Taurin (Giran, recorded route): crafting materials (not the crafter), recipes it cannot use, seal stones, ancient adena, L2Day letters, old gear nobody plans. Consumables, quest items, upgrades stay. A leader / solo character outside Giran goes there first; members must be in Giran. Fee 30 adena per item. UNTESTED live (2026-10-09).', args: [NAME], kw: 'warehouse deposit bag full inventory materials stash' },
    { id: 'stashplan', cat: 'supply', kind: 'swarm', title: 'Warehouse plan (dry run)', tpl: '!stashplan[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'safe',
      desc: 'What would go into the warehouse and why (deposits nothing) -> Logs/stash_plan_<name>.json + party chat.', args: [NAME], kw: 'warehouse deposit plan stash dry run' },
    { id: 'enchant', cat: 'supply', kind: 'swarm', title: 'Enchant worn gear (safe limit)', tpl: '!enchant[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'destructive',
      desc: 'Enchant real worn pieces to the safe limit (+3, full armor +4) with the scrolls in the bag. Never Common items.', args: [NAME] },
    { id: 'dyeplan', cat: 'supply', kind: 'swarm', title: 'Dye plan (dry run)', tpl: '!dyeplan[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'safe', desc: 'Which symbol would be drawn next (buys nothing).', args: [NAME] },
    { id: 'dyes', cat: 'supply', kind: 'swarm', title: 'Buy dyes + draw symbol (Giran)', tpl: '!dyes[ {name}]', handler: 'self', targets: PT, def: 'char', safety: 'confirm', desc: 'Must stand in Giran. UNTESTED.', args: [NAME] },
    { id: 'shopscan', cat: 'supply', kind: 'swarm', title: 'Scan the Giran equipment shops', tpl: '!shopscan {name}', handler: 'self', targets: ['party', 'char'], def: 'char', safety: 'safe', desc: 'That character reads every Giran equipment shop (never buys) -> Logs/shopscan.json.', args: [{ key: 'name', label: 'Character', type: 'char' }] },
    { id: 'soulget', cat: 'supply', kind: 'swarm', title: 'Soul crystals: fetch (Gideon, Oren)', tpl: '!soul get', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Lvl 40+: the leader takes the team to Gideon for free crystals.' },
    { id: 'soulstore', cat: 'supply', kind: 'swarm', title: 'Soul crystals: store finished ones', tpl: '!soul store', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Finished crystals into the Giran warehouse.' },
    { id: 'soulstat', cat: 'supply', kind: 'swarm', title: 'Soul crystals: status', tpl: '!soul', handler: 'each', targets: PT, def: 'party', safety: 'safe', desc: 'Everyone reports its crystals in party chat.' },
    { id: 'soulonoff', cat: 'supply', kind: 'swarm', title: 'Soul crystals: use on/off', tpl: '!soul {on}', handler: 'each', targets: PT, def: 'party', safety: 'confirm', desc: 'Crystal use on or off (until a reload).', args: [{ key: 'on', label: 'Crystal use', type: 'onoff', def: 'on' }] },
    { id: 'b_buyitem', cat: 'supply', kind: 'bot', title: 'Buy item (open shop)', tpl: '/buyitem {id} {count}', targets: ['char', 'chars'], def: 'char', safety: 'confirm', desc: 'L2Swarm buy from the open NPC shop (the bots use their own buy packets).', args: [{ key: 'id', label: 'Item', type: 'item' }, { key: 'count', label: 'Count', type: 'number', def: '1' }] },
    { id: 'b_sellitem', cat: 'supply', kind: 'bot', title: 'Sell item (open shop)', tpl: '/sellitem {id} {count}', targets: ['char'], def: 'char', safety: 'destructive', desc: 'L2Swarm sell to the open NPC shop (often ignored by L2Toggle; !sell is the working way).', args: [{ key: 'id', label: 'Item', type: 'item' }, { key: 'count', label: 'Count', type: 'number', def: '1' }] },
    { id: 'b_clicklink', cat: 'supply', kind: 'bot', title: 'Click dialog link', tpl: '/clicklink {text}', targets: ['char', 'chars'], def: 'char', safety: 'confirm', desc: 'Click a link with this text in the open NPC dialog.', args: [{ key: 'text', label: 'Link text', type: 'text' }] },

    // ---------------- Leveling / Spots ----------------
    { id: 'level', cat: 'level', kind: 'swarm', title: 'Level (Giran -> hunting spot)', tpl: '!level', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm',
      desc: 'Regroup in Giran, the leader picks a spot for the lowest level (or the party spot chosen on the Parties tab) and teleports the team.', kw: 'grind farm xp autolevel' },
    { id: 'autolevel', cat: 'level', kind: 'swarm', title: 'Auto-level (same as Level)', tpl: '!autolevel', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'In leader mode = !level.' },
    { id: 'autosolo', cat: 'level', kind: 'swarm', title: 'Auto-level solo', tpl: '!autolevel solo', handler: 'each', targets: ['char', 'chars'], def: 'char', safety: 'confirm', desc: 'This character levels on its own (no party logic).' },
    { id: 'autostop', cat: 'level', kind: 'swarm', title: 'Stop leveling', tpl: '!autolevel stop', handler: 'each', targets: PT, def: 'party', safety: 'confirm', desc: 'Stop the leveling loop (no full stop).' },
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
    { id: 'kamaloka', cat: 'raid', kind: 'swarm', title: 'Kamaloka', tpl: '!mission kamaloka[ {lvl}]', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'Run a Kamaloka (empty = the one that fits).', args: [{ key: 'lvl', label: 'Kamaloka', type: 'kamaloka', optional: true }], kw: 'instance hall labyrinth' },
    { id: 'missionstop', cat: 'raid', kind: 'swarm', title: 'Stop mission', tpl: '!mission stop', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Abort the running mission trip.' },
    { id: 'raidhunt', cat: 'raid', kind: 'swarm', title: 'Raid hunter', tpl: '!raidhunt[ {min} {max}]', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm',
      desc: 'Take the bosses that fit, lowest first, until a wipe/timeout. Optional level range.', args: [{ key: 'min', label: 'Boss level from', type: 'number', optional: true }, { key: 'max', label: 'to', type: 'number', optional: true }] },
    { id: 'raidhuntstop', cat: 'raid', kind: 'swarm', title: 'Stop raid hunter', tpl: '!raidhunt stop', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'During a fight: after the current boss.' },
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
    { id: 'clanskill', cat: 'clan', kind: 'swarm', title: 'Learn the clan focus skill', tpl: '!clanskill', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', desc: 'At Gesto (clan leader).' },
    { id: 'clanwh', cat: 'clan', kind: 'swarm', title: 'Look in the clan warehouse', tpl: '!clanwh', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'safe', desc: 'The clan leader opens the clan warehouse and reports what is in it.' },
    { id: 'clancreate', cat: 'clan', kind: 'swarm', title: 'Create the clan', tpl: '!clancreate', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Only when there is no clan yet (the code refuses a second clan).' },
    { id: 'siegeplan', cat: 'clan', kind: 'swarm', title: 'Siege: run a saved plan now', tpl: '!siege plan {plan}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Order the plan\'s main (CC) party. Plans: Fortresses / Castles tab.', args: [{ key: 'plan', label: 'Plan', type: 'siegeplan' }] },
    { id: 'siegefort', cat: 'clan', kind: 'swarm', title: 'Siege a fortress now', tpl: '!siege fort {fort}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Ad-hoc fortress siege with this party. UNTESTED.', args: [{ key: 'fort', label: 'Fortress', type: 'fort' }] },
    { id: 'siegecastle', cat: 'clan', kind: 'swarm', title: 'Siege a castle now', tpl: '!siege castle {castle}', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Ad-hoc castle siege with this party. UNTESTED.', args: [{ key: 'castle', label: 'Castle', type: 'castle' }] },
    { id: 'siegestop', cat: 'clan', kind: 'swarm', title: 'Stop the siege', tpl: '!siege stop', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'Stop a running siege.' },
    { id: 'siegeregfort', cat: 'clan', kind: 'swarm', title: 'Register for a fortress siege', tpl: '!siegereg fort {fort}', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', desc: 'The clan leader registers at the Suspicious Merchant (the first clan pays 250,000 adena).', args: [{ key: 'fort', label: 'Fortress', type: 'fort' }] },
    { id: 'siegeregcastle', cat: 'clan', kind: 'swarm', title: 'Register for a castle siege', tpl: '!siegereg castle {castle}', handler: 'clanleader', targets: ['char'], def: 'char', safety: 'confirm', desc: 'The clan leader registers at the castle Messenger.', args: [{ key: 'castle', label: 'Castle', type: 'castle' }] },

    // ---------------- Seven Signs ----------------
    { id: 'dawn', cat: 'signs', kind: 'swarm', title: 'Sign up with the Lords of Dawn', tpl: '!dawn', handler: 'leader', targets: ['party', 'all', 'clan'], def: 'party', safety: 'confirm', desc: 'The leader takes the team to the Priest of Dawn in Giran (always Dawn, never Dusk).', kw: 'seven signs catacomb' },

    // ---------------- Bot control ----------------
    { id: 'b_enablebot', cat: 'bot', kind: 'bot', title: 'Bot ON', tpl: '/enablebot', targets: PT, def: 'char', safety: 'confirm', desc: 'Enable the L2Swarm bot (follow, assist, auto skills).' },
    { id: 'b_disablebot', cat: 'bot', kind: 'bot', title: 'Bot OFF', tpl: '/disablebot', targets: PT, def: 'char', safety: 'confirm', desc: 'Disable the L2Swarm bot (the script keeps running).' },
    { id: 'b_startpoints', cat: 'bot', kind: 'bot', title: 'Start route points', tpl: '/startpoints', targets: PT, def: 'char', safety: 'confirm', desc: 'L2Swarm route points on.' },
    { id: 'b_stoppoints', cat: 'bot', kind: 'bot', title: 'Stop route points', tpl: '/stoppoints', targets: PT, def: 'char', safety: 'confirm', desc: 'L2Swarm route points off.' },
    { id: 'b_runmacro', cat: 'bot', kind: 'bot', title: 'Run a macro', tpl: '/runmacro {name}', targets: PT, def: 'char', safety: 'confirm', desc: 'Run an L2Swarm macro by name.', args: [{ key: 'name', label: 'Macro', type: 'text' }] },
    { id: 'b_configset', cat: 'bot', kind: 'bot', title: 'Config: set a value', tpl: '/config set {key} {value}', re: /^\/config\s+set\b/i, targets: ['char', 'chars', 'party'], def: 'char', safety: 'destructive',
      desc: 'Live config change (then "Config: save" to keep it). Passwords can never be set here.', args: [{ key: 'key', label: 'Property (as in the XML)', type: 'text', placeholder: 'FollowDistance' }, { key: 'value', label: 'Value', type: 'text' }] },
    { id: 'b_configsave', cat: 'bot', kind: 'bot', title: 'Config: save', tpl: '/config save', re: /^\/config\s+save\s*$/i, targets: ['char', 'chars', 'party'], def: 'char', safety: 'confirm', desc: 'Save the live config to its own XML (never to another file).' },
    { id: 'b_configload', cat: 'bot', kind: 'bot', title: 'Config: load XML', tpl: '/config load {file}', re: /^\/config\s+load\b/i, targets: ['char'], def: 'char', safety: 'destructive', desc: 'Load a config file from Settings (must be this character\'s own file).', args: [{ key: 'file', label: 'XML in Settings', type: 'text', placeholder: '<Character>.xml' }] },

    // ---------------- Client mode / Account ----------------
    { id: 'a_ingame', cat: 'client', kind: 'action', action: 'clientmode', mode: 'ingame', title: 'In-game (l2.exe client)', tpl: 'client mode: in-game', targets: ['char'], def: 'char', safety: 'confirm', desc: 'L2Swarm Hook: logs out, starts l2.exe, logs in through the client (~2 min, 1-2 GB RAM). Only ONE hooked client at a time.' },
    { id: 'a_oog', cat: 'client', kind: 'action', action: 'clientmode', mode: 'oog', title: 'Out of game (no client)', tpl: 'client mode: out of game', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Close the l2.exe client and play out of game again.' },
    { id: 'a_logout', cat: 'client', kind: 'action', tpl: '@logout', title: 'Log out (close the account)', targets: ['char', 'chars'], def: 'char', safety: 'destructive', desc: 'MCP close_account: the character leaves the game; a character left in a hunting ground stays in the world and can die.' },
    { id: 'a_login', cat: 'client', kind: 'action', tpl: '@login', title: 'Log in (open the account)', targets: ['char', 'chars'], def: 'char', safety: 'confirm', desc: 'MCP open_account with the character\'s config file.' },

    // ---------------- PC / L2Swarm ----------------
    { id: 'p_start', cat: 'pc', kind: 'action', action: 'system', sys: 'start', title: 'Start L2Swarm', tpl: 'L2Swarm start', targets: ['none'], def: 'none', safety: 'confirm', desc: 'Through the elevated task; logs everyone in 20 s apart.' },
    { id: 'p_restart', cat: 'pc', kind: 'action', action: 'system', sys: 'restart', title: 'Restart L2Swarm', tpl: 'L2Swarm restart', targets: ['none'], def: 'none', safety: 'destructive', desc: 'Every restart costs ~4 min of logins and breaks raids. Never during a raid/Kamaloka.' },
    { id: 'p_stop', cat: 'pc', kind: 'action', action: 'system', sys: 'stop', title: 'Stop L2Swarm', tpl: 'L2Swarm stop', targets: ['none'], def: 'none', safety: 'destructive', desc: 'Everyone goes offline. Send the parties to a town first.' },
    { id: 'p_deploy', cat: 'pc', kind: 'action', action: 'system', sys: 'deploy', title: 'Deploy swarm.js', tpl: 'deploy swarm.js', targets: ['none'], def: 'none', safety: 'destructive', desc: 'Copies Scripts_dev/swarm.js live (memory leak per reload; refused during raids; may restart L2Swarm above the size limit).' },

    // ---------------- Debug / Reports ----------------
    { id: 'escapetest', cat: 'debug', kind: 'swarm', title: 'Escape test (no teleport)', tpl: '!escapetest[ {name}]', handler: 'each', targets: ['char', 'party'], def: 'char', safety: 'confirm',
      desc: 'Runs the real escape on one character in TEST mode: CC on the nearest monster (only within 900), run to the nearest safe spot, wait for no hits, then STOPS before .townname / Scroll of Escape. Live escape box + map on the Parties tab; result in Logs/escape.log. Refused in raids / Kamaloka / missions and below 70 % HP. No name = the target character (party target = its leader).',
      args: [{ key: 'name', label: 'Character (empty = the one the order goes to)', type: 'char', optional: true }], kw: 'escape flee cc safe spot soe test' },
    { id: 'escapetestfull', cat: 'debug', kind: 'swarm', title: 'Escape test FULL (.townname / Scroll of Escape)', tpl: '!escapetest {name} full', handler: 'each', targets: ['char', 'party'], def: 'char', safety: 'destructive',
      desc: 'Like "Escape test" but goes all the way: .townname, and a Scroll of Escape when .townname is refused — the character ends up in a town.',
      args: [{ key: 'name', label: 'Character', type: 'char' }], kw: 'escape flee soe test full' },
    { id: 'dumpskills', cat: 'debug', kind: 'swarm', title: 'Dump skills to a file', tpl: '!dumpskills', handler: 'each', targets: PT, def: 'char', safety: 'safe', desc: '-> Logs/skills_<name>.json' },
    { id: 'b_loc', cat: 'debug', kind: 'bot', title: 'Location (/loc)', tpl: '/loc', targets: PT, def: 'char', safety: 'safe', desc: 'Prints the position in the bot log.' },
    { id: 'b_time', cat: 'debug', kind: 'bot', title: 'Game time', tpl: '/time', targets: ['char'], def: 'char', safety: 'safe', desc: 'Server time message.' },
    { id: 'b_instancezone', cat: 'debug', kind: 'bot', title: 'Instance zone info', tpl: '/instancezone', targets: PT, def: 'char', safety: 'safe', desc: 'Which instances are locked (Kamaloka re-entry times).' },

    // ---------------- Legacy (exist in swarm.js, mostly switched off in the leader-controlled design) ----------------
    { id: 'farm', cat: 'legacy', kind: 'swarm', title: 'Farm at the camp point', tpl: '!farm', handler: 'each', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Old farm mode: tank pulls to the camp, others fight in a box (set the camp first).' },
    { id: 'camp', cat: 'legacy', kind: 'swarm', title: 'Camp here (leader position)', tpl: '!camp', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'The leader broadcasts his position as the camp point.' },
    { id: 'setcamp', cat: 'legacy', kind: 'swarm', title: 'Set camp point', tpl: '!setcamp {x} {y} {z}', handler: 'each', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Camp point by coordinates.', args: [{ key: 'x', label: 'x', type: 'number' }, { key: 'y', label: 'y', type: 'number' }, { key: 'z', label: 'z', type: 'number' }] },
    { id: 'go', cat: 'legacy', kind: 'swarm', title: 'Raid prep (!go)', tpl: '!go[ {boss}]', handler: 'each', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Old raid prep: destroyers drain + Frenzy, then the leader posts !raid. Use "Raid a boss" instead.', args: [{ key: 'boss', label: 'Boss', type: 'boss', optional: true }] },
    { id: 'raidold', cat: 'legacy', kind: 'swarm', title: 'Raid sequence now (!raid)', tpl: '!raid[ {boss}]', handler: 'each', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Old: every role runs its raid routine at the current spot.', args: [{ key: 'boss', label: 'Boss', type: 'boss', optional: true }] },
    { id: 'career', cat: 'legacy', kind: 'swarm', title: 'Career (solo 1-40)', tpl: '!career', handler: 'each', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Off in leader mode (answers "switched off").' },
    { id: 'escort', cat: 'legacy', kind: 'swarm', title: 'Class-quest escort', tpl: '!escort', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Off in leader mode; class quests removed 2026-10-03.' },
    { id: 'quest', cat: 'legacy', kind: 'swarm', title: 'Quest', tpl: '!quest[ {text}]', handler: 'each', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Off in leader mode.', args: [{ key: 'text', label: 'Quest / resume', type: 'text', optional: true }] },
    { id: 'queststop', cat: 'legacy', kind: 'swarm', title: 'Stop quest', tpl: '!queststop', handler: 'each', targets: PT, def: 'char', safety: 'confirm', desc: 'Stops a running quest.' },
    { id: 'gear', cat: 'legacy', kind: 'swarm', title: 'Gear share (!gear)', tpl: '!gear', handler: 'leader', targets: ['party'], def: 'party', safety: 'confirm', desc: 'Off in leader mode.' },
    { id: 'shop', cat: 'legacy', kind: 'swarm', title: 'Shop trip (!shop)', tpl: '!shop', handler: 'each', targets: ['char'], def: 'char', safety: 'confirm', desc: 'Off in leader mode.' },
    { id: 'kamaold', cat: 'legacy', kind: 'swarm', title: '!kamaloka (placeholder)', tpl: '!kamaloka', handler: 'each', targets: ['party'], def: 'party', safety: 'safe', desc: 'Old placeholder ("not built"); use Raids -> Kamaloka.' },
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
