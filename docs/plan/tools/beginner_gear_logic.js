// BEGINNERGEAR-PURE (2026-10-12): pure decision logic for the beginner gear sources in Scripts/data/beginner_gear.json.
// No fs, no game calls: the quest engine (or swarm.js, pasted as a block) gives it the data + one character and gets back
// what that character should do. Used by docs/plan/tools/beginner_gear_plan.js (writes Scripts/data/beginner_gear_plan.json)
// and tested by docs/plan/tools/test_beginnergear.js.
//
// ch = { name, level, classId, plan?: [classIds the user approved], party?, done?: { <entryKey>: true } }
// tree = Scripts/data/class_tree.json (classes[id] = { race, type: 'fighter'|'mystic', tier, root, ... })
// data = Scripts/data/beginner_gear.json
'use strict';

var BG_STATUS = {
  NOW: 'now',            // eligible right now
  LATER: 'later',        // will become eligible (level / class change still ahead)
  MISSED: 'missed',      // the window has closed (level / class too high)
  BLOCKED: 'blocked',    // the conditions cannot be met by this team (e.g. needs a Kamael party member)
  SKIP: 'skip',          // possible but not worth it for this character (reason given)
  DONE: 'done',          // already done (engine records it)
  NA: 'n/a'              // not for this race / class
};

function bgClassInfo(classId, tree) {
  var c = tree && tree.classes ? tree.classes[String(classId)] : null;
  if (!c) return null;
  return { id: c.id, name: c.name, race: c.race, type: c.type, tier: c.tier, root: c.root };
}

// The class the character is heading for: last approved plan class, else the current one.
function bgTargetClass(ch) {
  if (ch && ch.plan && ch.plan.length) return ch.plan[ch.plan.length - 1];
  return ch ? ch.classId : null;
}

// Which shadow weapon to take from multisell 305986001 (data.weaponPick: rules in order, first match wins).
function bgPickWeapon(ch, tree, data) {
  var info = bgClassInfo(ch.classId, tree);
  if (!info) return null;
  var targets = [ch.classId].concat(ch.plan || []);
  var rules = (data && data.weaponPick && data.weaponPick.rules) || [];
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    if (r.type && r.type !== info.type) continue;
    if (r.race && r.race !== info.race) continue;
    if (r.classIds) {
      var hit = false;
      for (var j = 0; j < targets.length; j++) if (r.classIds.indexOf(targets[j]) >= 0) { hit = true; break; }
      if (!hit) continue;
    }
    return { itemId: r.itemId, entryId: r.entryId, why: r.why, label: r.label || 'INFERRED' };
  }
  return null;
}

// Items the character gets from an entry (fighter / mystic variants resolved).
function bgRewardFor(entry, ch, tree) {
  var info = bgClassInfo(ch.classId, tree) || {};
  var out = [];
  var items = (entry.rewards && entry.rewards.items) || [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.forType && it.forType !== info.type) continue;
    if (it.forRace && it.forRace !== info.race) continue;
    out.push(it);
  }
  return out;
}

function bgRaceOk(req, race) {
  if (!req) return true;
  if (req.races && req.races.length && req.races.indexOf(race) < 0) return false;
  if (req.notRaces && req.notRaces.indexOf(race) >= 0) return false;
  return true;
}

// One entry for one character -> { status, why, priority, deadline?, pick? }
function bgEntryStatus(entry, ch, tree, data, team) {
  var info = bgClassInfo(ch.classId, tree);
  if (!info) return { status: BG_STATUS.NA, why: 'unknown class id ' + ch.classId };
  if (ch.done && ch.done[entry.key]) return { status: BG_STATUS.DONE, why: 'already done' };
  var req = entry.requirements || {};
  var lv = entry.level || {};
  var lvMin = lv.min == null ? 1 : lv.min, lvMax = lv.max == null ? 999 : lv.max;
  if (!bgRaceOk(req, info.race)) return { status: BG_STATUS.NA, why: 'race ' + info.race + ' cannot take it' };
  if (req.types && req.types.indexOf(info.type) < 0) return { status: BG_STATUS.NA, why: info.type + ' cannot take it' };
  // class tier window (0 = base class, 1 = after the 1st change ...)
  var tMin = req.classTierMin == null ? 0 : req.classTierMin, tMax = req.classTierMax == null ? 9 : req.classTierMax;
  if (info.tier > tMax) return { status: BG_STATUS.MISSED, why: 'class tier ' + info.tier + ' > ' + tMax + ' (only before that class change)' };
  if (ch.level > lvMax) return { status: BG_STATUS.MISSED, why: 'level ' + ch.level + ' > ' + lvMax };
  // team conditions (Nornil's Garden needs a Kamael with quest 179 in the party)
  if (req.partyNeeds) {
    var pn = req.partyNeeds, found = false;
    var members = (team && team.members) || [];
    for (var m = 0; m < members.length; m++) {
      var mi = bgClassInfo(members[m].classId, tree);
      if (!mi) continue;
      if (pn.race && mi.race !== pn.race) continue;
      if (pn.classTier != null && mi.tier !== pn.classTier) continue;
      if (pn.levelMax != null && members[m].level > pn.levelMax) continue;
      found = true; break;
    }
    if (!found) return { status: BG_STATUS.BLOCKED, why: pn.why || 'party condition not met' };
  }
  var waiting = [];
  if (ch.level < lvMin) waiting.push('level ' + lvMin);
  if (info.tier < tMin) waiting.push('class change ' + tMin);
  var res;
  if (waiting.length) res = { status: BG_STATUS.LATER, why: 'needs ' + waiting.join(' + ') };
  else res = { status: BG_STATUS.NOW, why: 'eligible' };
  // value gate: data says when it is not worth it (e.g. starting-village weapon quests for characters about to reach 20)
  var sk = entry.plan && entry.plan.skipIf;
  if (sk && res.status !== BG_STATUS.BLOCKED) {
    if (sk.levelAtLeast != null && ch.level >= sk.levelAtLeast) return { status: BG_STATUS.SKIP, why: sk.why };
    if (sk.always) return { status: BG_STATUS.SKIP, why: sk.why };
  }
  res.priority = (entry.plan && entry.plan.priority) || 9;
  if (entry.plan && entry.plan.deadline) res.deadline = entry.plan.deadline;
  if (entry.key === 'newbie_weapon_coupon') {
    var pick = bgPickWeapon(ch, tree, data);
    if (pick) res.pick = pick;
    // urgency: the window closes at level 20 / the first class change (which the class plan gate does at 20)
    if (res.status === BG_STATUS.NOW && ch.level >= 18) res.urgent = true;
  }
  if (entry.key === 'newbie_accessory_coupon' && res.status === BG_STATUS.NOW && ch.level >= 36) res.urgent = true;
  return res;
}

// All entries for one character, ordered: now (urgent first, then priority), later, then the rest.
function bgTasksFor(ch, tree, data, team) {
  var out = [];
  var entries = (data && data.entries) || [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var s = bgEntryStatus(e, ch, tree, data, team);
    var t = { key: e.key, questId: e.questId == null ? null : e.questId, name: e.name, status: s.status, why: s.why };
    if (s.priority != null) t.priority = s.priority;
    if (s.deadline) t.deadline = s.deadline;
    if (s.pick) t.pick = s.pick;
    if (s.urgent) t.urgent = true;
    if (s.status === BG_STATUS.NOW || s.status === BG_STATUS.LATER) {
      var rw = bgRewardFor(e, ch, tree);
      if (rw.length) t.rewardItems = rw.map(function (r) { return r.id; });
    }
    out.push(t);
  }
  var rank = { now: 0, later: 1, blocked: 2, skip: 3, missed: 4, done: 5, 'n/a': 6 };
  out.sort(function (a, b) {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (!!b.urgent !== !!a.urgent) return b.urgent ? 1 : -1;
    return (a.priority || 9) - (b.priority || 9);
  });
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BG_STATUS: BG_STATUS, bgClassInfo: bgClassInfo, bgTargetClass: bgTargetClass, bgPickWeapon: bgPickWeapon,
    bgRewardFor: bgRewardFor, bgRaceOk: bgRaceOk, bgEntryStatus: bgEntryStatus, bgTasksFor: bgTasksFor };
}
