// LOGINPARTY-2026-11-25 (owner: "Whole parties don't log in together yet ... fix these"): pure helpers for the dashboard's logins.
//   partyOrder(list, keyOf, isLeader) -> the same items, each party as one block (leader first, then its members), parties in the order they
//   first appear; an item without a party keeps its place. The startup login run does the same in PowerShell (docs/plan/tools/login_order.ps1).
//   gapMs(seconds) -> the gap between two logins in ms: the setting when it is 5 s or more, else 8 s (owner rule: never under 5 s).
// Test: docs/plan/tools/test_owner_1125.js
'use strict';
function partyOrder(list, keyOf, isLeader) {
  const groups = new Map();
  (list || []).forEach((x, i) => { const k = String(keyOf(x) || '') || '\u0000' + i; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
  const out = [];
  groups.forEach(g => { g.forEach(x => { if (isLeader(x)) out.push(x); }); g.forEach(x => { if (!isLeader(x)) out.push(x); }); });
  return out;
}
function gapMs(seconds) { const s = Number(seconds); return (s >= 5 ? Math.round(s) : 8) * 1000; }
module.exports = { partyOrder, gapMs };
