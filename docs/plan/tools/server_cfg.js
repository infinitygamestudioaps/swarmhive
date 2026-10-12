// server_cfg.js — builds Scripts/data/server_cfg.json + docs/plan/server_cfg.md (L2Toggle ".cfg" / ".help", 2026-10-12).
//   node docs/plan/tools/server_cfg.js            (re-run after new Logs/cabinet_*.html captures; keeps botDefaults of the existing json)
// Sources: forum topic 60 ".cfg & .help" (Scrapyard, 2020-04-23, 1 post, no replies, 4 screenshots) = GUIDE;
//          our own live captures Logs/cabinet_*.html / cabinet_after_*.html (swarm.js cabinetSet saves them) = LIVE;
//          CLAUDE.md §2d (live tests 2026-10-03) = LIVE; everything we concluded ourselves = INFERRED.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const P = require('./cfg_pure.js');
const OUT_JSON = path.join(ROOT, 'Scripts', 'data', 'server_cfg.json');
const OUT_MD = path.join(ROOT, 'docs', 'plan', 'server_cfg.md');
const LOGS = path.join(ROOT, 'Logs');

// ---------------------------------------------------------------- the options (one per row of the live page)
// rec.value: what the bots should have; rec.auto: the optional auto-apply (patch_servercfg.js) may set it; rec.owner: who already manages it
const OPTIONS = [
  { key: 'language', kind: 'choice', values: ['English', 'Русский'], def: 'English', src: 'GUIDE+LIVE',
    what: 'Menu language. Russian shows most server menus (board, Cabinet, dialogs) in Russian.',
    bot: 'Every page parser in swarm.js (board buffs, gatekeepers, Career, Cabinet) matches ENGLISH labels.',
    rec: { value: 'English', auto: true, why: 'Russian would break every page the bots click (INFERRED from how the parsers work).' } },
  { key: 'translit', kind: 'toggle', def: false, src: 'GUIDE+LIVE', what: 'Transliterates what you type from Latin to Cyrillic letter by letter (the "Lt" mode).',
    bot: 'Would garble every party-chat order (!level, !stop ...) and every .townname the bots type (INFERRED).',
    rec: { value: false, auto: true, why: 'Chat orders and dot-commands must stay Latin.' } },
  { key: 'blockExp', kind: 'toggle', def: false, src: 'GUIDE+LIVE', what: 'On = the character receives no experience.',
    bot: 'LEVEL LOCK owns it: swarm.js levelCtlTick sets it from Scripts/data/level_control.json (dashboard Circuit -> Levels).',
    rec: { value: null, auto: false, owner: 'levelCtl (level_control.json)', why: 'Never touched by the cfg defaults; the level lock decides per character.' } },
  { key: 'blockPetExp', kind: 'toggle', def: false, src: 'LIVE (not in the 2020 post)', what: 'On = the summoned pet receives no experience (INFERRED from the label).',
    bot: 'Not used. No bot raises a pet today.', rec: { value: null, auto: false, why: 'Leave it (Off on all 36 captured characters).' } },
  { key: 'noTraders', kind: 'toggle', def: false, src: 'GUIDE+LIVE', what: 'On = you do not see player shops (private stores) in towns. The post: lowers PC load, faster loading after a teleport to Giran.',
    bot: 'The bots never use player shops. Fewer objects in Giran = less work for L2Swarm (RAM is our bottleneck) (INFERRED).',
    rec: { value: true, auto: false, trial: true, why: 'Probably good for L2Swarm memory in Giran; test on ONE character first (do our CharList / occupied-spot checks still see normal players? they should: only shops are hidden).' } },
  { key: 'noAnimations', kind: 'toggle', def: false, src: 'GUIDE+LIVE (2020 name "Disable Buffs Animation")', what: 'On = the server does not send buff / magic animations of others to you. The post: helps boxes run longer without a reboot.',
    bot: 'swarm.js reads OnMagicSkillUse (own cast tracking, raid position tracking of monsters). If the server stops sending MagicSkillUse of others, monster-skill tracking may lose data (INFERRED risk).',
    rec: { value: true, auto: false, trial: true, why: 'Less traffic and work for L2Swarm; test on ONE non-raid character and compare Logs/positional.log + cast bars before turning it on everywhere.' } },
  { key: 'classicShift', kind: 'toggle', def: false, src: 'GUIDE+LIVE', what: 'Off (default) = Shift + left click on a monster opens "NPC Information" (level, HP, MP, aggressive, XP, SP) with a Droplist button (tabs Common / Spoil, rates adjusted for your level difference). On = the classic client Shift behaviour.',
    bot: 'Not used (out-of-game bots have no Shift click). Possible future: scrape live drop / spoil rates (INFERRED).', rec: { value: false, auto: false, why: 'Keep Off: it is the one that gives the drop list.' } },
  { key: 'followDialog', kind: 'toggle', def: true, src: 'GUIDE+LIVE', what: "Party members follow the party leader's NPC dialog: gatekeeper teleports (the leader pays). Topic 57 + our tests: NOT quest dialogs (disabled as an exploit), members must be in range, out of combat, no flag / karma.",
    bot: 'swarm.js gatekeeper.serverFollow relies on it: only the leader clicks the gatekeeper, followers wait 8 s and port themselves only if the server did not take them.',
    rec: { value: true, auto: true, why: 'The whole travel design depends on it (CLAUDE.md §2d).' } },
  { key: 'followTown', kind: 'toggle', def: true, src: 'GUIDE+LIVE', what: "Party follows the leader's .townname. Must be On for the leader AND the member; whole party not in combat, not flagged, no karma, in range. Off on the leader = nobody follows; Off on a member = that member stays.",
    bot: 'Every town trip (.giran etc., teamRegroupBeforePort, swarm.lead.hub) relies on it.', rec: { value: true, auto: true, why: 'Travel rule: towns only via .townname with the party.' } },
  { key: 'followDead', kind: 'toggle', def: true, src: 'LIVE (not in the 2020 post)', what: "Follow Party Leader's Dead to Village/etc.: when the leader picks a restart point after death, dead members are taken along (INFERRED from the label).",
    bot: 'After a wipe the party comes back together in one town (CLAUDE.md §2d: On on all characters).', rec: { value: true, auto: true, why: 'Keeps a wiped party together.' } },
  { key: 'forwardDrop', kind: 'toggle', def: null, src: 'LIVE (not in the 2020 post)', what: 'Forward Drop to Party Leader: every drop a member picks up / gets goes to the party leader.',
    bot: 'User decision: switched OFF on 2026-10-03 (members stayed broke), ON again 2026-10-04 (leader sells, stashes and hands out). Set with !cabinet Forward Drop on|off.',
    rec: { value: null, auto: false, owner: 'user (!cabinet Forward Drop)', why: 'A user decision per team; On on every captured character today.' } },
  { key: 'qtMaster', kind: 'toggle', def: null, src: 'LIVE', what: 'Quick Trade - Skip Confirmations, Master Account: trades with characters of the same master account open without the accept dialog.',
    bot: 'Supply / adena / gear / hand-over trades between our characters.', rec: { value: true, auto: true, why: 'Bot trades need it.' } },
  { key: 'qtParty', kind: 'toggle', def: null, src: 'LIVE', what: 'Quick Trade - Skip Confirmations, Party: the same for party members.',
    bot: 'Switched On for the first 12 on 2026-10-03 (user OK). Off on the characters created later (see the live counts) - harmless today because Same IP is On everywhere (all bots run on one PC).',
    rec: { value: true, auto: true, why: 'Same rule for all accounts (user rule); needed if a bot ever trades a party member from another IP / master account.' } },
  { key: 'qtSameIp', kind: 'toggle', def: null, src: 'LIVE', what: 'Quick Trade - Skip Confirmations, Same IP.', bot: 'Covers every bot-to-bot trade (one PC).', rec: { value: true, auto: true, why: 'Bot trades need it.' } },
  { key: 'qaMaster', kind: 'toggle', def: null, src: 'LIVE', what: 'Quick Accept Party/Clan Invitations, Master Account: party / clan invites from the same master account are accepted at once.',
    bot: 'Party (re)forming and clan invites.', rec: { value: true, auto: true, why: 'Parties re-form by themselves after restarts.' } },
  { key: 'qaSameIp', kind: 'toggle', def: null, src: 'LIVE', what: 'Quick Accept Party/Clan Invitations, Same IP.', bot: 'Same; covers the second master account.', rec: { value: true, auto: true, why: 'Parties re-form across master accounts.' } },
  { key: 'noCarrier', kind: 'number', def: 0, src: 'LIVE (not in the 2020 post)', what: 'No Carrier: a number ("Current value: 0", edit box + Set). INFERRED from the L2-Scripts family this page comes from: seconds the character stays in the world after its connection drops (0 = removed at once). Not tested.',
    bot: 'Not used. A higher value keeps a disconnected bot standing in the hunting ground (where it can die: CLAUDE.md, 3.8.6 update deaths).',
    rec: { value: null, auto: false, why: 'Leave 0 until we know what it does; never raise it for bots in the field.' } },
];

// ---------------------------------------------------------------- .help (topic 60 screenshot, 15 commands) + live notes
const COMMANDS = [
  { cmd: '.whoiam', syntax: '.whoiam', desc: 'Detailed information about character.', src: 'GUIDE', bot: 'not used', rec: 'Could replace stat reads; no need (the bots read Me.*).' },
  { cmd: '.cfg', syntax: '.cfg', desc: 'User settings (the Settings page above; same as Alt+B -> Home/Cabinet -> Settings).', src: 'GUIDE', bot: 'swarm.js opens it via the board (boardPath Cabinet -> Settings).', rec: 'Board path is proven; ".cfg" by chat is untested (would save two page loads).' },
  { cmd: '.repair', syntax: '.repair <character> (INFERRED)', desc: 'Repair other character from current account.', src: 'GUIDE', bot: 'not used', rec: 'Manual fix for a character stuck at login (it must be offline, INFERRED). Ask the user first.' },
  { cmd: '.offline', syntax: '.offline', desc: 'Start offline trading.', src: 'GUIDE', bot: 'not used', rec: 'Never for bots (needs a private store; the character stays in the world).' },
  { cmd: '.lock', syntax: '.lock', desc: 'Lock character over IP/HWID.', src: 'GUIDE', bot: 'not used', rec: 'NEVER: an HWID lock could stop L2Swarm (out of game, no HWID) from logging in (INFERRED).' },
  { cmd: '.password', syntax: '.password', desc: 'Change account password.', src: 'GUIDE', bot: 'not used', rec: 'NEVER from a bot (password rule, CLAUDE.md §4).' },
  { cmd: '.autohp', syntax: '.autohp (INFERRED; the live Cabinet has an "Autopotion" page)', desc: 'Enable automatic use items restores HP.', src: 'GUIDE', bot: 'not used: swarm.js survival loop (Healing Potion < 30 % HP) + L2Swarm AutoItem do it.', rec: 'Leave off: a second, unknown-threshold potion user next to ours burns potions. Test on one character if the script loop ever proves too slow.' },
  { cmd: '.automp', syntax: '.automp (INFERRED)', desc: 'Enable automatic use items restores MP.', src: 'GUIDE', bot: 'not used: swarm.js Mana Potion 728 below 25 % (healers 45/70 %).', rec: 'Leave off (same reason).' },
  { cmd: '.autocp', syntax: '.autocp (INFERRED)', desc: 'Enable automatic use items restores CP.', src: 'GUIDE', bot: 'not used (no CP potions bought).', rec: 'Leave off.' },
  { cmd: '.hellbound', syntax: '.hellbound', desc: 'Hellbound level and confidence.', src: 'GUIDE', bot: 'not used', rec: 'Info only (Hellbound is level 78+).' },
  { cmd: '.epic', syntax: '.epic', desc: "Show's Grand Boss Status.", src: 'GUIDE', bot: 'not used', rec: 'Idea: one character reads it before an epic trip to refresh Logs/raid_status.json (reply format unknown - capture it first).' },
  { cmd: '.exp', syntax: '.exp', desc: "Show's exp left till next level.", src: 'GUIDE', bot: 'not used (Me.Exp + the exp table do it).', rec: 'Not needed.' },
  { cmd: '.town', syntax: '.<townname>  e.g. .giran', desc: 'Type in . name of town to be instantly teleported to that town when not in combat. Ex: .Giran', src: 'GUIDE+LIVE', bot: 'swarm.js townCommand (11 towns: gludin gludio dion giran oren aden hunters heine goddard rune schuttgart; docs/plan/town_commands.md). Plain ".town" only answers the usage text (system message 1983).', rec: 'In use; the party follows when Follow Party Leader\'s .town is On.' },
  { cmd: '.time / .date', syntax: '.time  /  .date', desc: "Show's current date/time.", src: 'GUIDE', bot: 'not used', rec: 'Not needed.' },
  { cmd: '.clanwarehouse', syntax: '.clanwarehouse', desc: 'Opens Clan Warehouse Withdrawal menu to manage which characters are allowed to withdraw from Clan Warehouse', src: 'GUIDE', bot: 'not used', rec: 'The clan leader could allow chosen members to withdraw (CLAUDE.md says only the leader can take items out). Read the menu once by hand before automating.' },
  { cmd: '.buffstore', syntax: '.buffstore', desc: 'Listed by the live .help (CLAUDE.md §2d, 2026-10-03); not in the 2020 screenshot. A player buff shop (INFERRED from the name).', src: 'LIVE (list only)', bot: 'not used', rec: 'Not for bots.' },
  { cmd: '.cfg toggles by chat', syntax: '.cfg <option> (UNKNOWN)', desc: 'The post only shows the page; no chat syntax for single options is documented.', src: 'GUIDE (absence)', bot: '-', rec: 'Bots click the page buttons (bypass codes without "-h ").' },
];

// ---------------------------------------------------------------- live captures
function liveCaptures() {
  const by = {};
  if (!fs.existsSync(LOGS)) return { chars: {}, counts: {} };
  fs.readdirSync(LOGS).filter(f => /^cabinet_(after_)?[^_]+\.html$/.test(f)).forEach(f => {
    const n = f.replace(/^cabinet_(after_)?/, '').replace(/\.html$/, ''), st = fs.statSync(path.join(LOGS, f));
    if (!by[n] || st.mtimeMs > by[n].t) by[n] = { f, t: st.mtimeMs };
  });
  const chars = {}, counts = {};
  Object.keys(by).sort().forEach(n => {
    const r = P.cfgParse(fs.readFileSync(path.join(LOGS, by[n].f), 'utf8'));
    if (!r.ok) return;
    const v = P.cfgValues(r.rows);
    chars[n] = { file: 'Logs/' + by[n].f, at: new Date(by[n].t).toISOString(), values: v };
    Object.keys(v).forEach(k => { const s = v[k] === true ? 'On' : v[k] === false ? 'Off' : String(v[k]); counts[k] = counts[k] || {}; counts[k][s] = (counts[k][s] || 0) + 1; });
  });
  let layout = null;
  const any = Object.keys(chars)[0];
  if (any) layout = P.cfgParse(fs.readFileSync(path.join(ROOT, chars[any].file), 'utf8')).rows.map(r => ({ key: r.key, section: r.section, label: r.label, kind: r.kind, bypass: r.bypass, button: r.button }));
  return { chars, counts, layout };
}

function build() {
  let old = null; try { old = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8').replace(/^﻿/, '')); } catch (e) { }
  const live = liveCaptures();
  const want = {}; OPTIONS.forEach(o => { if (o.rec.auto && o.rec.value != null) want[o.key] = o.rec.value; });
  const trial = {}; OPTIONS.forEach(o => { if (o.rec.trial) trial[o.key] = o.rec.value; });
  const botDefaults = (old && old.botDefaults) || {
    _doc: 'Read live by swarm.js after patch_servercfg.js. autoApply=false = nothing happens by itself; "!cfg" reports, "!cfg apply" sets "want" once (explicit order). want: true/false per toggle key, "English" for language, a number for noCarrier, null = leave it. chars.<Name> = per-character overrides. trial = recommended but NOT applied (test on one character, then move it into want). blockExp is always ignored (the level lock owns it); forwardDrop is not in want on purpose (user decision) - add it only when the user says so.',
    autoApply: false, verifyHours: 12, startDelayS: 120, want, trial, chars: {}, onlyChars: [], skipChars: [] };
  const J = {
    _doc: 'L2Toggle Kain ".cfg" (Alt+B -> Cabinet -> Settings) + ".help" user commands. Generated by docs/plan/tools/server_cfg.js (keeps botDefaults). Doc: docs/plan/server_cfg.md.',
    generatedAt: new Date().toISOString(),
    sources: {
      forum: { url: 'https://community.lineage2toggle.com/index.php?/topic/60-cfg-help/', title: '.cfg & .help', author: 'Scrapyard', posted: '2020-04-23', pages: 1, replies: 0, note: 'Written before the Kain launch (2025-04-26); 4 screenshots (Home menu, Settings, NPC Information 20818, Commands list).' },
      live: 'Logs/cabinet_*.html + cabinet_after_*.html (swarm.js cabinetSet saves the page; newest file per character)',
      tags: { GUIDE: 'forum topic 60', LIVE: 'our own captures / live tests', INFERRED: 'our conclusion, not verified', DATAPACK: 'L2J High Five datapack' },
    },
    open: { board: "_bbshome -> Cabinet -> Settings (the page arrives as an NPC-style dialog, OnNpcHtmlMessage)", chat: '.cfg (GUIDE: the same page; untested by the bots)',
      liveCabinetMenu: ['Autopotion', 'Restore character', 'Character info', 'Settings'], forum2020HomeMenu: ['Character info', 'Commands (= .help)', 'Settings (= .cfg)', 'Autopotion', 'Premium Account', 'Professions', 'Subclass', 'Restore character'],
      sendRule: 'Buttons are "bypass -h 0x": send the code WITHOUT "-h " (e.g. "0c") or nothing happens (CLAUDE.md §2d). No Carrier: "010 <number>" (INFERRED: the client replaces $set with the edit box text).',
      matchRule: 'Match a row by section + label (cfgFind), never by code and never by a bare "Party" / "Master Account" / "Same IP" (two sections share them).' },
    options: OPTIONS.map(o => Object.assign({}, o, { label: (live.layout || []).find(r => r.key === o.key) ? (live.layout || []).find(r => r.key === o.key).label : o.key,
      section: (live.layout || []).find(r => r.key === o.key) ? (live.layout || []).find(r => r.key === o.key).section : '',
      bypassLive: (live.layout || []).find(r => r.key === o.key) ? (live.layout || []).find(r => r.key === o.key).bypass : '', liveCounts: live.counts[o.key] || {} })),
    commands: COMMANDS,
    sideFindings: [
      { what: 'Live Cabinet "Information about personal raites" on 28 captured common accounts (Logs/bbs_*.html, 2026-10-12): XP x1.5, SP x1.5, Adena x1.5, Items x1.5, Spoil x1.5, Quest items x1, Quest reward x1.', src: 'LIVE', conflict: 'server_features_kain.md (topic 3605) says x1 base. The live page wins for planning.' },
      { what: 'Classic Shift screenshot (2020, Hallate\'s Warrior 20818): XP 21281 / SP 1948 = exactly 1.2x the datapack (17734 / 1624); HP 16040 / MP 1567 do not match the datapack (base 2142 x3 from passive 4408 = 6425; MP 1158).', src: 'GUIDE vs DATAPACK', conflict: 'Old server; do not use these numbers for Kain.' },
      { what: 'Scripts/data/npcs_h5.json hp leaves out the NPC passive 4408 "HP Modifiers" (Hallate\'s Warrior: 2142 stored, ~6425 real).', src: 'DATAPACK', conflict: 'Monster HP estimates from npcs_h5.json can be ~3x too low for such monsters.' },
      { what: 'Topic 60 says Follow Party Leader\'s Dialog follows quest dialogs; topic 57 + our tests: quest dialogs are NOT followed.', src: 'GUIDE vs LIVE', conflict: 'Trust topic 57 / live.' },
      { what: 'Old swarm.js cabinetSet matched the FIRST row containing the text: "!cabinet Party off" switched OFF Follow Party Leader\'s Dialog, "!cabinet Party on" answered "already On" without touching Quick Trade Party; "Master Account" / "Same IP" always hit the Quick Trade row.', src: 'LIVE page + code', conflict: 'Fixed by patch_servercfg.js (cfgFind); the dashboard list now offers section-qualified names.' },
    ],
    live: { chars: live.chars, counts: live.counts, layout: live.layout },
    botDefaults,
  };
  return J;
}

function md(J) {
  const L = [];
  const yn = (v) => v === true ? 'On' : v === false ? 'Off' : v == null ? 'leave' : String(v);
  const cnt = (c) => Object.keys(c || {}).map(k => `${k} ${c[k]}`).join(' / ') || '-';
  const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');
  L.push('# Server settings `.cfg` + user commands `.help` (L2Toggle Kain)', '');
  L.push(`Generated by \`node docs/plan/tools/server_cfg.js\` (${J.generatedAt.slice(0, 16)}Z) from forum topic 60 (GUIDE), our live captures \`Logs/cabinet_*.html\` (LIVE) and our own conclusions (INFERRED). Data: \`Scripts/data/server_cfg.json\`. Parser: \`docs/plan/tools/cfg_pure.js\` (CFG-PURE block). Test: \`node docs/plan/tools/test_cfg.js\`.`, '');
  L.push('Forum topic 60 ".cfg & .help" (Scrapyard, 2020-04-23) is one post with no replies and 4 screenshots, and nothing in it needs a login. It was written before the Kain launch (2025-04-26), so the live page has more rows than the post.', '');
  L.push('## How to open it', '');
  L.push(`- Board: ${J.open.board}. The bots use this path (\`cabinetSet\`). The live Cabinet menu is ${J.open.liveCabinetMenu.join(' · ')}. The 2020 Home menu also had Commands (= .help), Premium Account, Professions and Subclass.`);
  L.push(`- Chat: ${J.open.chat}.`);
  L.push(`- Clicking: ${J.open.sendRule}`);
  L.push(`- Matching: ${J.open.matchRule}`, '');
  L.push('## Options (live page order)', '');
  L.push('| # | Key | Section: label (live) | Values | Bypass (live) | What it does | Live now (characters) | Bots | Recommended | Auto |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  J.options.forEach((o, i) => {
    const vals = o.kind === 'toggle' ? 'On / Off' : o.kind === 'number' ? 'number' : (o.values || []).join(' / ');
    const name = o.section && !/^settings$/i.test(o.section) ? `${o.section}: ${o.label}` : o.label;
    L.push(`| ${i + 1} | \`${o.key}\` | ${esc(name)} | ${vals} | \`${esc(o.bypassLive)}\` | ${esc(o.what)} *(${o.src})* | ${esc(cnt(o.liveCounts))} | ${esc(o.bot)} | **${yn(o.rec.value)}**${o.rec.trial ? ' (test first)' : ''}${o.rec.owner ? ' — owner: ' + esc(o.rec.owner) : ''}. ${esc(o.rec.why)} | ${o.rec.auto ? 'yes' : 'no'} |`);
  });
  const nChars = Object.keys(J.live.chars).length, qpOff = (J.live.counts.qtParty || {}).Off || 0;
  L.push('', 'The "Auto" column marks the rows that the optional auto-apply (`patch_servercfg.js`, `botDefaults.autoApply`, **off by default**) may set. Every one of those rows already has the recommended value on all ' + nChars + ' captured characters, except Quick Trade: Party, which is Off on ' + qpOff + ' of them (all created after 2026-10-03). That is harmless while Same IP is On.', '');
  L.push('## What our bots set today', '');
  L.push('- `Block experience`: the level lock (`levelCtlTick` → `expBlockSet` → `cabinetSet(\'Block experience\')`) sets it from `Scripts/data/level_control.json` (dashboard Circuit → Levels). The cfg defaults never touch it.');
  L.push('- `Forward Drop to Party Leader`: the user decides this with `!cabinet Forward Drop on|off` (Off 2026-10-03, On again 2026-10-04). It is On on every captured character.');
  L.push('- Quick Trade (Master Account / Party / Same IP) and Quick Accept: Claude switched them on by hand for the first 12 on 2026-10-03 (user OK). The later characters had the server defaults, which are the same except Quick Trade: Party.');
  L.push('- Follow Party Leader\'s Dialog / .town / Dead to Village: server default On, and the travel design relies on them (CLAUDE.md §2d). Nothing re-checks them today; `!cfg` (patch) reports them.');
  L.push('- `.autohp/.automp/.autocp`: not used. swarm.js has its own survival loop (Mana Potion 728, Healing Potion 1061, self heals), and L2Swarm AutoItem is in the XML.');
  L.push('- `.townname`: used for every town trip (`townCommand`, 11 towns).', '');
  L.push('## Recommended bot settings', '');
  L.push('| Key | Value | Why |', '|---|---|---|');
  J.options.filter(o => o.rec.value != null || o.rec.owner).forEach(o => L.push(`| \`${o.key}\` | ${o.rec.owner ? 'owned by ' + esc(o.rec.owner) : yn(o.rec.value) + (o.rec.trial ? ' (test on one character first)' : '')} | ${esc(o.rec.why)} |`));
  L.push('', 'Everything else stays as it is: Block pet experience Off, Classic Shift Off (it is the setting that gives the drop list), No Carrier 0.', '');
  L.push('## `.help` user commands (topic 60 screenshot, 15 entries, plus live notes)', '');
  L.push('| Command | Syntax | Server text | Source | Bots today | Recommendation |', '|---|---|---|---|---|---|');
  J.commands.forEach(c => L.push(`| \`${esc(c.cmd)}\` | ${esc(c.syntax)} | ${esc(c.desc)} | ${c.src} | ${esc(c.bot)} | ${esc(c.rec)} |`));
  L.push('', '## Side findings and conflicts', '');
  J.sideFindings.forEach(f => L.push(`- ${f.what} *(${f.src})* → ${f.conflict}`));
  L.push('', '## Live values per character (newest capture)', '');
  const keys = (J.live.layout || []).map(r => r.key);
  L.push('| Character | Captured (UTC) | ' + keys.join(' | ') + ' |', '|---|---|' + keys.map(() => '---|').join(''));
  Object.keys(J.live.chars).forEach(n => { const c = J.live.chars[n]; L.push(`| ${n} | ${c.at.slice(0, 16)} | ` + keys.map(k => yn(c.values[k])).join(' | ') + ' |'); });
  L.push('', 'Not captured yet: every character that never ran `cabinetSet` (party 2: Crafter1, Spoiler1, Healer1, among others). After the patch, `!cfg` writes `Logs/servercfg_<Name>.json` and saves the page.', '');
  L.push('## Bot automation (patch_servercfg.js, NOT applied)', '');
  L.push('- **cabinetSet fix:** rows are found with `cfgFind` (key, "Section: Label", alias, then exact > prefix > contains). An ambiguous text is refused and nothing is clicked. Before the fix, `!cabinet Party off` turned OFF Follow Party Leader\'s Dialog.');
  L.push('- **`!cfg [name]`:** reads the page and reports in party chat. It writes `Logs/servercfg_<Name>.json` with the values and the diff against `botDefaults.want`. It changes nothing.');
  L.push('- **`!cfg apply [name]`:** sets every `botDefaults.want` row that differs (each click is verified on the page the server returns). This is an explicit order, so it works with autoApply off.');
  L.push('- **Auto-apply:** only when `botDefaults.autoApply` is true (default **false**). It runs once per script start, `startDelayS` (120 s) after the character is ready, then every `verifyHours` (12 h); a failure waits 15 min. It never runs while dead, fighting, in a raid or mission, trading, or using a gatekeeper or the board. `onlyChars` / `skipChars` limit it. `trial` rows are NOT applied by auto-apply, only listed.');
  L.push('- Dashboard: the `!cabinet` suggestions now name the section ("Quick Trade: Party"). The `!cfg` catalog entries come after the patch is applied (the snippet is in the patch header).', '');
  return L.join('\n') + '\n';
}

if (require.main === module) {
  const J = build();
  const tmp = OUT_JSON + '.tmp';
  if (fs.existsSync(OUT_JSON)) { try { fs.copyFileSync(OUT_JSON, OUT_JSON.replace(/\.json$/, '.bak.json')); } catch (e) { } }
  fs.writeFileSync(tmp, JSON.stringify(J, null, 1)); fs.renameSync(tmp, OUT_JSON);
  fs.writeFileSync(OUT_MD, md(J));
  console.log(`server_cfg.json: ${J.options.length} options, ${J.commands.length} commands, ${Object.keys(J.live.chars).length} characters captured; autoApply=${J.botDefaults.autoApply}`);
}
module.exports = { build, md, OPTIONS, COMMANDS };
