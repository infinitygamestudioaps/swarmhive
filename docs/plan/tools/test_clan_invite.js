// OFFLINE CHECK of WHO GETS INVITED (user 2026-10-10: "why did it invite all the others?" -> "option 1, so I control who gets invited"):
// the clan leader invites only names in clan_quests.json clan.inviteAllow (dashboard Clan tab), none = nobody.
//   node docs/plan/tools/test_clan_invite.js
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), page = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
let fails = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };
const i = src.indexOf('const allow = new Set(((cfg.clan && cfg.clan.inviteAllow) || []).map(String));'), j = src.indexOf('Send.RequestJoinPledge(', i);
ok(i > 0 && j > i, 'the invite loop reads clan.inviteAllow before any RequestJoinPledge');
// CLANAUTO 2026-10-12: a ticked PARTY (clan.inviteParties) counts too; nothing ticked in either list = nobody
ok(/if \(!allow\.size && !allowParties\.size\) \{[^}]*return; \}/.test(src.slice(i, j)), 'an empty list = nobody is invited (no names and no parties ticked)');
ok(/clanInviteAllowed\(n, teamOf\(n\), allow, allowParties\)/.test(src.slice(i, j))
  && /function clanInviteAllowed\(n, team, allow, parties\) \{ return !!\(\(allow && allow\.has\(String\(n\)\)\) \|\| \(parties && team && parties\.has\(String\(team\)\)\)\); \}/.test(src),
  'only ticked names (or members of a ticked party) are candidates');
ok((src.match(/Send\.RequestJoinPledge\(/g) || []).length === 1, 'no other code path sends clan invites');
ok(/b\.action === 'invite'/.test(srv) && /cq0\.clan\.inviteAllow = /.test(srv), 'server.js /api/clan saves the ticks');
// the whole-party button moved to CLANAUTO (data-cainvp, handled in Dashboard/clanauto.js)
const ca = fs.readFileSync(path.join(ROOT, 'Dashboard', 'clanauto.js'), 'utf8');
ok(/Who gets invited/.test(page) && /data-clinv=/.test(page) && /data-cainvp=/.test(page) && /d.cainvp/.test(ca), 'Clan tab: per character + whole party buttons');
console.log(fails ? `${fails} FAILED` : 'all clan invite checks passed'); process.exit(fails ? 1 : 0);
