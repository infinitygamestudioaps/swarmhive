// Writes docs/plan/dashboard_commands.md from the command catalog (Dashboard/commands.js) + the fixed list of dashboard endpoints.
//   node docs/plan/tools/dashboard_commands_doc.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const K = require(path.join(ROOT, 'Dashboard', 'commands.js'));
const SCOPE = { party: 'party', char: 'one character', chars: 'several characters', all: 'all parties', clan: 'clan', none: 'PC' };
const HAND = { leader: 'party leader acts, party follows', each: 'every window that hears it', self: 'each character for itself ([name] = only that one)', clanleader: 'clan leader only' };
const SAFE = { safe: 'safe', confirm: 'needs confirm', destructive: '**destructive** (confirm + typed YES; server refuses without it)' };
const argTxt = (c) => (c.args || []).map(a => `${a.optional ? '[' : '<'}${a.key}${a.optional ? ']' : '>'}: ${a.type}`).join(', ');
const where = (c) => c.targets.includes('none') ? 'palette (search) · PC tab' : `palette · ${c.targets.includes('party') ? 'party sheet' : ''}${c.targets.includes('party') && (c.targets.includes('char') || c.targets.includes('chars')) ? ' + ' : ''}${c.targets.includes('char') || c.targets.includes('chars') ? 'character sheet' : ''}${c.handler === 'clanleader' ? ' (clan leader / his party)' : ''}`;
const esc = (s) => String(s || '').replace(/\|/g, '\\|');
let md = `# Dashboard commands — inventory (command center, 2026-10-08)

Generated from \`Dashboard/commands.js\` by \`node docs/plan/tools/dashboard_commands_doc.js\` — edit the catalog, then re-run this.
Every command below can be given from the dashboard: the **search field** at the top (Ctrl+K or "/"; finds characters, parties, commands, pages)
or the **Commands** button on a party card / character page (command sheet by category). Every order shows a preview of exactly what is sent
and asks first (who gets it, how many characters, who is busy); destructive ones need a second, typed YES and the server refuses them without it.

How a command travels (server.js \`commandPlan\`):
- **! swarm commands** (Scripts_dev/swarm.js \`handleSay\`): party chat. Party target = once, from the party leader (the whole party hears it);
  character target = from that character (only its own window obeys — a leader's own line is heard by his party). A character without a party
  (Dagger1) gets it as normal chat. All = every party leader; clan = every clan member.
- **/ L2Swarm chat-box commands** (CLAUDE.md §3): sent to every chosen character one by one (\`run_account_command\`); a party = each member.
- **@login / @logout**: MCP open_account (the character's config) / close_account.
- Passwords are never read or set (any / command naming a password is refused); \`/config save\` never takes a file name (it would re-point the account).

Counts: ${K.COMMANDS.length} catalog entries — ${K.COMMANDS.filter(c => c.kind === 'swarm').length} swarm (${K.SWARM_WORDS.length} distinct !words = every !command swarm.js handles except the internal !ready),
${K.COMMANDS.filter(c => c.kind === 'bot').length} L2Swarm chat-box (${K.BOT_WORDS.length} distinct /words), ${K.COMMANDS.filter(c => c.kind === 'action').length} dashboard actions.
Safety: ${['safe', 'confirm', 'destructive'].map(s => `${K.COMMANDS.filter(c => c.safety === s).length} ${s}`).join(', ')}.

`;
K.CATS.forEach(([id, label]) => {
  const cs = K.COMMANDS.filter(c => c.cat === id); if (!cs.length) return;
  md += `## ${label}\n\n| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |\n|---|---|---|---|---|---|---|\n`;
  cs.forEach(c => { md += `| \`${esc(c.tpl)}\` | ${esc(argTxt(c)) || '—'} | ${c.kind === 'bot' ? 'each chosen character (L2Swarm)' : c.kind === 'action' ? 'dashboard' : esc(HAND[c.handler] || '')} | ${c.targets.map(t => SCOPE[t] || t).join(', ')} | ${SAFE[c.safety]} | ${where(c)} | ${esc(c.title)}: ${esc(c.desc)} |\n`; });
  md += '\n';
});
md += `## Other dashboard actions (their own tabs / endpoints, unchanged)

| Action | Endpoint | Scope | Safety | Where |
|---|---|---|---|---|
| Party quick buttons Status / Level / Supply / Collect / Class / Buff / Stop + task dropdown "Do" | POST /api/command | party / character | confirm | party card, character page (kept) |
| Raidhunt / stop raidhunt, Raid <boss> | POST /api/command | party | confirm | Raid bosses tab, raid page |
| Kamaloka run, daily Kamaloka on/off | POST /api/command, POST /api/daily | party | confirm | Kamaloka tab |
| Siege plans (save / delete / status), siege now, register | POST /api/sieges, /api/command | clan / party | confirm | Fortresses / Castles tabs (sieges.js) |
| Clan name, active clan quests, skill focus, clan warehouse, clan event (joint raid) | POST /api/clan, /api/command | clan | confirm | Clan tab |
| Hunting spot per party, tactics (hunting pairs) | POST /api/partyspot, /api/tactics | party | confirm | Parties tab |
| Zones, spots, rooms, raid routes, Giran town routes | /api/zones, /api/route, /api/roomroute, /api/townroute | data files | confirm | Zones / Spots / Rooms / Raid / Teleports tabs |
| Sell list, gear preferences, soul crystal plan | /api/sell, /api/gearprefs, /api/soul | data files | safe | character page, Gear, Crystals tabs |
| Client mode in-game / out of game | POST /api/clientmode | one character | confirm | character page + command center (Client mode) |
| Transfer adena / items X -> Y | POST /api/transfer | two characters | needs confirm (trades) | Accounts tab |
| Create character / academy account | POST /api/newchar, /api/newaccount | account | confirm (password stored encrypted, never shown) | Accounts tab |
| L2Swarm start / restart / stop, deploy swarm.js | POST /api/system | PC | restart/stop/deploy destructive | PC tab + command center (PC / L2Swarm) |

## Not exposed on purpose
- MCP low-level game actions (\`send_game_action\`: raw_packet, destroy_item, drop_item, crystallize, enchant packets, mail, trades with outsiders):
  Claude-only, each needs the user's explicit OK (CLAUDE.md §4). The dashboard's \`/trade\` (destructive) is the only trade opener.
- \`manage_account_config modify Password\` / any password field (never).
- \`!ready\` (internal: destroyers report to the leader during !go).
`;
fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'dashboard_commands.md'), md);
console.log('wrote docs/plan/dashboard_commands.md', md.length, 'chars');
