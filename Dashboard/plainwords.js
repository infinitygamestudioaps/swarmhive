// PLAIN WORDS (UX audit 2026-10-13, docs/plan/ux_audit_2026-10-13.md batch B2; owner: "the UI must be easy for non-technical people").
// One shared translator: the bots' intent log lines, notes, order results and server messages -> short plain sentences for players.
// Never shown in the main view: coordinates, object / NPC / quest ids, "#nnn" system message numbers, priorities (P0-P6), step codes
// (WALK_LEG 5/6), internal ids (letters_<name>_<id>), file paths, regexes and !commands. The raw text stays available as `detail`
// (the pages show it under "Details" in Advanced mode only).
//
//   Plain.clean(text)          generic clean-up of any bot text
//   Plain.place(text)          a hunting place / spot name without old team prefixes ("Trio: ", "Party 4 (Mystic Muse): ", "(team 3, route …)")
//   Plain.task(task)           the "while: …" context of a step -> "on the way to X" / "leveling at X" / '' (nothing worth saying)
//   Plain.event(e)             an /api/intent event -> { text, why, res: [cls, text], icon, detail }
//   Plain.result(e, newest)    [cls, text] for how a step ended (ok / bad / run / muted)
//   Plain.resultText(s)        an OK / FAIL detail in plain words
//   Plain.order(why, state, cmd) an order result reason in plain words (Orders sheet)
//   Plain.cmd(cmd)             "!supply" -> "Supply run"
//   Plain.dist(n)              2400 -> "a short walk away"
// Loaded in the browser (window.Plain, via Dashboard/ui_kit.js) and in node (module.exports; docs/plan/tools/test_plainwords.js).
(function (root) {
  'use strict';
  const S = (v) => String(v == null ? '' : v);
  const cap = (s) => { s = S(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

  // ---------------------------------------------------------------------------------------------------- !commands -> words
  const CMD = {
    '!stop': 'Stop', '!level': 'Leveling', '!autolevel': 'Leveling', '!supply': 'Supply run', '!restock': 'Supply run', '!collect': 'Collect adena',
    '!classchange': 'Class change', '!buff': 'Rebuff', '!park': 'Back to town', '!formation': 'Line up', '!hunthere': 'Stay here and hunt',
    '!status': 'Status report', '!soe': 'Escape to town', '!town': 'Free teleport to a town', '!gk': 'Gatekeeper teleport', '!goto': 'Walk to a place',
    '!raidhunt': 'Hunt raid bosses', '!mission': 'Mission', '!raid': 'Raid', '!kamaloka': 'Kamaloka', '!sell': 'Sell items', '!upgrade': 'Gear upgrade',
    '!gearplan': 'Gear plan', '!stash': 'Store items', '!handover': 'Hand items over', '!loot': 'Pick up the loot', '!assist': 'Help another party',
    '!circuit': 'Raid circuit', '!scout': 'Scout a boss', '!soul': 'Soul crystals', '!enchant': 'Enchant', '!skillenchant': 'Skill enchant',
    '!dyes': 'Draw symbols', '!cabinet': 'Server setting', '!regroup': 'Regroup', '!return': 'Go back', '!unstick': 'Walk free', '!delevel': 'Lose levels',
    '!mark': 'Save a place', '!places': 'Saved places', '!nonstop': 'Non-stop hunting', '!sevensigns': 'Seven Signs', '!ss': 'Seven Signs',
    '!clanlevel': 'Clan level', '!quest': 'Quest', '!escort': 'Quest escort', '!ov': 'One-time action', '!trade': 'Trade', '!fund': 'Adena hand-out',
  };
  function cmd(c) {
    const t = S(c).trim().replace(/^#(?=!)/, ''), m = /^(![a-z0-9_]+)\s*(.*)$/i.exec(t);
    if (!m) return t;
    const base = CMD[m[1].toLowerCase()];
    const rest = m[2].trim();
    if (base) return rest && !/^(on|off)$/i.test(rest) ? `${base}: ${rest}` : rest ? `${base} ${rest.toLowerCase()}` : base;
    return cap(m[1].slice(1)) + (rest ? ': ' + rest : '');
  }

  // ---------------------------------------------------------------------------------------------------- distances
  function dist(n) {
    n = Number(n);
    if (!isFinite(n) || n < 0) return '';
    if (n < 300) return 'right here';
    if (n < 1500) return 'close by';
    if (n < 6000) return 'a short walk away';
    if (n < 25000) return 'a long walk away';
    return 'far away';
  }
  const walkWords = (n) => { n = Number(n); return !isFinite(n) ? '' : n < 1500 ? 'a few steps' : n < 6000 ? 'a short way' : n < 25000 ? 'a long way' : 'very far'; };

  // ---------------------------------------------------------------------------------------------------- server messages
  // "(server: #144 That is an incorrect target.)" -> "(the server said: That is an incorrect target.)"; a known success is called one
  const SYS_OK = /^(?:Your trade was successful|You begin trading with)/i;
  function sys(code, text) {
    const t = S(text).trim();
    if (/^Your trade was successful/i.test(t)) return 'the trade went through';
    return t ? 'the server said: ' + t.replace(/\s+$/, '') : '';
  }

  // ---------------------------------------------------------------------------------------------------- generic clean-up
  function clean(s) {
    let t = S(s);
    if (!t) return '';
    // a success reported as a failure (handover "L2Day - E: trade completed (server: #123 Your trade was successful.)")
    t = t.replace(/trade completed \(server: #?123 Your trade was successful\.?\)/gi, 'trade went through (the server confirmed it)');
    // server messages: keep the words, drop the number; collapse the same message twice in a row
    t = t.replace(/\(server: #?\d+ ([^()]*)\)/g, (_, x) => '(' + sys(0, x) + ')');
    t = t.replace(/\(#\d+ ([^()]*)\)/g, (_, x) => '(' + sys(0, x) + ')');
    t = t.replace(/(\([^()]+\))(?:\s*\1)+/g, '$1').replace(/&#\d+;?/g, '');
    t = t.replace(/\b(?:system )?message #\d+\b:?\s*/gi, '').replace(/(^|\s)#\d{2,6}\b/g, '$1');
    // priorities, step codes, internal ids, order ids, file paths, regexes
    t = t.replace(/\s*\(P\d\)/g, '');
    t = t.replace(/\b[A-Z]{2,}(?:_[A-Z]{2,})+\s+\d+\/\d+\b(?:\s+[a-z]+(?:\s+[\d.]+k?)?)?/g, '');
    t = t.replace(/\(?\border [a-z]+_[a-z0-9]+_m[a-z0-9]{6,}\)?/gi, '').replace(/\b[a-z]+_[a-z0-9]+_m[a-z0-9]{6,}\b:?\s*/gi, '');
    t = t.replace(/\b(?:order )?o[0-9a-z]{9,}\b/g, '');
    t = t.replace(/\(?\b(?:Logs|Scripts|Settings|Dashboard|docs|Scripts_dev)[\\/][\w\\/.<>*-]+\)?/g, '').replace(/\(?\b[\w-]+\.json\)?/g, '');
    t = t.replace(/\s*\/[^/\s][^/]*\|[^/]*\/[gimsuy]*/g, '');
    // !commands -> words
    t = t.replace(/(^|[\s("'])#?(![a-z][a-z0-9_]*)(?:\s+(on|off|\w+))?/gi, (all, pre, c, arg) => {
      const w = CMD[c.toLowerCase()];
      if (!w) return pre + c.slice(1) + (arg ? ' ' + arg : '');
      return pre + (arg && /^(on|off)$/i.test(arg) ? w.toLowerCase() + ' ' + arg.toLowerCase() : w.toLowerCase() + (arg ? ' ' + arg : ''));
    });
    // town commands ".giran" -> "Giran"
    t = t.replace(/(^|[\s(])\.(gludin|gludio|dion|giran|oren|aden|hunters|heine|goddard|rune|schuttgart|townname)\b/gi, (_, p, n) => p + (n.toLowerCase() === 'townname' ? 'town command' : cap(n.toLowerCase())));
    // NPC ids in front of a name ("#30120 -> Maximilian", "30486 -> Hanna")
    t = t.replace(/(^|\s)#?\d{5,6}\s*->\s*/g, '$1');
    // coordinates (x,y[,z]) with the little word before them
    t = t.replace(/\s*(?:\b(?:at|to|from|near|toward|towards)\s+)?@?-?\d{3,7},\s?-?\d{3,7}(?:,\s?-?\d{1,6})?(?:\s*\(within \d+\))?/g, '');
    // skill ids "skill 1016" -> "skill"
    t = t.replace(/\bskill \d{2,5}\b/g, 'a skill');
    // tidy
    t = t.replace(/\(\s*\)/g, '').replace(/\(\s*[,;·:-]\s*/g, '(').replace(/\s*[,;·]\s*\)/g, ')');
    t = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/(?:\s*[—–-]\s*){2,}/g, ' — ').replace(/[:·,\s—-]+$/g, '').replace(/^[\s:·,—-]+/, '');
    return t.trim();
  }

  // ---------------------------------------------------------------------------------------------------- places
  function place(s) {
    let t = S(s).trim();
    t = t.replace(/^(?:Trio|Team \d+|Party \d+(?: \([^)]*\))?|team \d+)\s*:\s*/i, '');
    t = t.replace(/\s*\((?:team \d+|Party \d+ \([^)]*\)|Trio)(?:,\s*route \d+-\d+)?\)/gi, '').replace(/\s*\(route \d+-\d+\)/gi, '');
    t = t.replace(/\s*\((?:Mobs \d+-\d+|\d+-\d+)\)/g, '').replace(/\s*\(Lv\d+(?:-\d+)?\)/g, '');
    t = t.replace(/\s+(\d+):\s+/, ' – ').replace(/\s+[—–-]\s+area \d+ \(([^)]*)\)$/, '');
    t = t.replace(/^Area @.*$/, 'a spot on the map').replace(/^local$/i, 'here');
    return clean(t);
  }

  // ---------------------------------------------------------------------------------------------------- the "while" context
  function task(tk) {
    const t = S(tk).trim().replace(/\s*->\s*$/, '');
    let m;
    if (!t || t === '-') return '';
    if (/^regroup:?\s*$/i.test(t)) return 'regrouping in town';
    if (/^trade <-/.test(t)) return 'receiving a trade';
    if (/^trade(?: ->|$)/.test(t)) return 'handing items over';
    if (/^gatekeeper/.test(t)) return 'using a gatekeeper';
    if ((m = /^autolevel: (.*?) · lvl \d+ · (\d+) kills/.exec(t))) return `leveling at ${place(m[1])}`;
    if ((m = /^autolevel: (.*?)(?: · |$)/.exec(t))) return `leveling at ${place(m[1])}`;
    if ((m = /^nav(?: atlas)?: (.*?)(?::\s*[A-Z]{2,}(?:_[A-Z]+)+\s+\d+\/\d+.*)?$/.exec(t))) return `on the way to ${place(m[1])}`;
    if ((m = /^route to (.+?)(?::\s+[a-z].*)?$/.exec(t))) return `on the way to ${place(m[1])}`;
    if ((m = /^(?:onto )?(\w+)'s route: (.*?) · /.exec(t))) return `following ${m[1]} through ${place(m[2])}`;
    if ((m = /^to (\w+): (.*?) · /.exec(t))) return `walking to ${m[1]} in ${place(m[2])}`;
    if ((m = /^(?:walk|street walk): (.*?)(?:: streets)? · /.exec(t))) return `walking through ${place(m[1])}`;
    if ((m = /^dungeon: walking to (.*)$/.exec(t))) return `walking to ${place(m[1])}`;
    if (/^waiting \d+ s for the team to load in/.test(t)) return 'waiting for the team to arrive after the teleport';
    if ((m = /^leading team: waiting at .*? for (.*)$/.exec(t))) return `waiting for ${names(m[1])}`;
    if ((m = /^leading team/.exec(t))) return 'leading the team';
    if ((m = /^leveling paused: (.*?) first$/.exec(t))) return `leveling paused for the ${clean(m[1]).toLowerCase()}`;
    if ((m = /^pair (\S+): back toward (\w+)/.exec(t))) return `pair ${m[1].replace('+', ' + ')} going back to ${m[2]}`;
    if ((m = /^before \.(\w+): fighting first/.exec(t))) return `finishing the fight before the teleport to ${cap(m[1])}`;
    if ((m = /^escape \((.*)\)$/.exec(t))) return `going to town (${clean(m[1]).toLowerCase()})`;
    if ((m = /^waiting for team: (.*)$/.exec(t))) return `waiting for the team (${clean(m[1])})`;
    if ((m = /^regroup:\s*(.+)$/.exec(t))) return 'regrouping: ' + clean(m[1]);
    return clean(t);
  }
  // "Healer2 1935, Saint1 1522" -> "Healer2, Saint1"
  const names = (s) => S(s).replace(/\s*\([^)]*\)\s*$/, '').split(/,\s*/).map(x => x.replace(/\s+\d+$/, '').trim()).filter(Boolean).join(', ');

  // ---------------------------------------------------------------------------------------------------- results
  function resultText(s) {
    const t = S(s).trim();
    let m;
    if (!t) return '';
    if (/^arrived$/.test(t) || /^at start$/.test(t)) return 'arrived';
    if ((m = /^at (\w+)$/.exec(t))) return 'at the ' + m[1];
    if (/^not there — \d+ left$/.test(t) || /^\d+ left$/.test(t)) return 'did not get all the way there';
    if ((m = /^\d+ from (\w+)$/.exec(t))) return `stopped short of the ${m[1]}`;
    if ((m = /^landed .*?\(([^)]+)\)$/.exec(t))) return 'arrived in ' + m[1];
    if ((m = /^landed at (.*?), (\d+) left to walk$/.exec(t))) return `arrived at ${m[1]}, ${walkWords(+m[2])} left to walk`;
    if (/^landed/.test(t)) return 'arrived';
    if (/^whole team arrived/.test(t) || /^whole team walked/.test(t)) return 'the whole team arrived';
    if ((m = /^route stopped at point/.exec(t))) return 'the walk stopped halfway';
    if ((m = /^moved (\d+)$/.exec(t))) return 'walked free';
    if ((m = /^still at .* after clicking around/.exec(t))) return 'still stuck after trying for 6 minutes';
    if (/did not move( me)?$/.test(t)) return 'the teleport did not happen';
    if ((m = /^no link to '(.*?)' at (.*?) \((\w+)\)/.exec(t))) return `the gatekeeper ${m[2]} in ${m[3]} does not go to ${m[1]}`;
    if ((m = /^(?:stash: )?deposited (\d+) kinds? .*? at (\w+) \((\w+) warehouse\)/.exec(t))) return `stored ${m[1]} kind${m[1] === '1' ? '' : 's'} of items in the ${m[3]} warehouse`;
    if ((m = /^(.+?) did not answer \d+ clicks/.exec(t))) return `${m[1]} did not answer`;
    if ((m = /^(.+?) is alive again$/.exec(t))) return `${m[1]} is alive again`;
    if (/^team together at the Giran start$/.test(t)) return 'the team is together in Giran';
    if (/^not everyone came$/.test(t)) return 'not everyone came';
    if (/^back in town$/.test(t)) return 'back in town';
    if (/^used \.townname$/.test(t)) return 'teleported to town';
    if (/^died$/.test(t)) return 'died';
    if ((m = /^sold (\d+) kind\(s\) for -?(\d+) adena$/.exec(t))) return `sold ${m[1]} kind${m[1] === '1' ? '' : 's'} of items`;
    if (/^step \d+\/\d+ failed: /.test(t)) return clean(t.replace(/^step \d+\/\d+ failed: /, ''));
    if (/; .*nothing to give/.test(t) || /^\w+: (?:OK|nothing to give)/.test(t)) {
      const ok = (t.match(/\w+: OK/g) || []).length;
      return ok ? `${ok} character${ok === 1 ? '' : 's'} got supplies` : 'everyone already had enough';
    }
    return clean(t);
  }
  function result(e, newest) {
    if (e && e.result === 'OK') return ['ok', '✓ ' + (resultText(e.resultDetail) || 'done')];
    if (e && (e.result === 'FAIL' || e.result === 'FEJL')) return ['bad', '✗ ' + (resultText(e.resultDetail) || 'did not work')];
    if (newest && e && Date.now() - Date.parse(e.at) < 15 * 60000) return ['run', '… in progress'];
    return ['muted', '— replaced by the next step'];
  }

  // ---------------------------------------------------------------------------------------------------- one intent event
  const ALIAS = { angreb: 'attack', 'hjælp': 'help', 'gå': 'walk', 'teleport-nær': 'teleport-near', 'led hold': 'lead team', 'saml hold': 'gather team', 'quest-jagt': 'quest-hunt' };
  function eventText(e) {
    const a = ALIAS[e.action] || e.action, d = S(e.detail).replace(/\s*\|\s*(?:fra|from) .*$/, '').trim();
    let m;
    switch (a) {
      case 'walk':
        if (/^refused/.test(d)) return 'Did not walk: too far and no teleport route';
        if ((m = /^Giran recorded route to (\w+)/.exec(d))) return `Walking to the ${m[1]} in Giran`;
        return 'Walking ' + (walkWords(e.dist) || 'a short way');
      case 'lead team': m = /with (.*)$/.exec(d); return 'Leading the team' + (m ? ` (${m[1].split(',').length} following)` : '');
      case 'gather team':
        if ((m = /waiting for (.*?)(?: \(([^)]*)\))?$/.exec(d))) return `Waiting for ${names(m[1])}`;
        if ((m = /^(\w+) still stuck/.exec(d))) return `${m[1]} is stuck — helping him get free`;
        if ((m = /^(\w+) will (\.\w+) on its own/.exec(d))) return `${m[1]} teleports to ${cap(m[2].slice(1))} on its own`;
        return 'Waiting for the team';
      case 'npc':
        if ((m = /walking in front of (.*) before clicking/.exec(d))) return `Walking up to ${m[1]}`;
        if ((m = /^talking to (.*)$/.exec(d))) return `Talking to ${m[1]}`;
        return cap(clean(d));
      case 'npc trip': m = /^(?:#?\d+\s*->\s*)?(.*?) at /.exec(d); return `Trip to ${m ? m[1] : clean(d)}`;
      case 'teleport': return 'Teleporting to ' + place(d.replace(/\s*\((?:nav|for|regroup|roll call|travel|teleport near|raid route|quest)[^]*$/, ''));
      case 'teleport-near': m = /^(.*?) -> (.*?) lands/.exec(d); return m ? `Teleporting closer: ${m[1]} → ${m[2]}` : 'Teleporting closer';
      case 'town': m = /^\.(\w+)/.exec(d); return m ? `Free teleport to ${cap(m[1])}` : 'Free teleport to town';
      case 'escape':
        if (/^alone in a fight/.test(d)) { m = /HP (\d+)%/.exec(d); return `Alone in a fight${m ? ' (' + m[1] + ' % HP)' : ''} — getting away to town`; }
        if (/Scroll of Escape|bruger Scroll/.test(d)) return 'Using a Scroll of Escape';
        return 'Going to town';
      case 'attack': return 'Fighting ' + clean(d.replace(/\s*\(\d+% HP\)/, '').replace(/\s*\(\d{6,}\)/, ''));
      case 'pair attack': m = /^(.*?) with (\w+)$/.exec(d); return m ? `Fighting ${clean(m[1].replace(/\s*\(\d+\)/, ''))} together with ${m[2]}` : 'Fighting in a pair';
      case 'help': m = /^(\w+) is being hit by (.*?) — /.exec(d); return m ? `Helping ${m[1]} (attacked by ${m[2]})` : 'Helping a teammate';
      case 'resurrect': m = /^(\w+) is dead — (.*)$/.exec(d); return m ? `Resurrecting ${m[1]}` + (/Scroll/.test(m[2]) ? ' with a scroll' : '') : 'Resurrecting a teammate';
      case 'route': m = /^(.*?) · .*?next: (.*)$/.exec(d); return m ? `Walking through ${place(m[1])}` + (m[2] && !/^(walk|street walk|to \w+|onto .*)$/.test(m[2]) ? ` — next: ${clean(m[2]).replace(/\s*->\s*/g, ' → ')}` : '') : 'Walking a route';
      case 'regroup': m = /next hunting spot: (.*)$/.exec(d); return m ? `Gathering everyone in Giran, then hunting at ${place(m[1])}` : 'Gathering everyone in town';
      case 'supply': m = /\(automatic: (\d+) running low\)/.exec(d); return `Supply run: buying scrolls, shots and potions for the team${m ? ` (${m[1]} running low)` : ''}`;
      case 'unstick': case 'unstuck': return 'Stuck — trying to walk free';
      case 'order': return 'Your order: ' + clean(d.replace(/^(!\w+)(\s+)?/, (x, c, sp) => cmd(c) + (sp ? ': ' : '')));
      case 'return': m = /^travel to (\w+)/.exec(d); if (m) return `Going back to ${m[1]}`; m = /^(.*?) -> (.*?) \(step/.exec(d); return m ? `Going back: ${m[1]} → ${m[2]}` : 'Going back to the team';
      case 'tactics':
        if (/^pairs ON/.test(d)) return 'Group tactics: fighting in pairs';
        m = /^pairs OFF: (.*?)(?: — .*)?$/.exec(d); return 'Group tactics: everyone on the same monster' + (m ? ` (${clean(m[1])})` : '');
      case 'sell': m = /in (\w+): (.*)$/.exec(d); return m ? `Selling items in ${m[1]}: ${m[2]}` : 'Selling items';
      case 'move': return 'No monsters left here — moving on to the next area';
      case 'nav atlas': m = /^(.*?): \d+ steps.*?~(\d+) min/.exec(d); return m ? `Planning the trip to ${place(m[1])} (about ${m[2]} min)` : 'Planning the trip';
      case 'class change': m = /^(.*?) -> (.*?) \(/.exec(d); return m ? `Class change: ${m[1]} → ${m[2]}` : 'Class change';
      case 'rescue': m = /^(\w+):/.exec(d); return m ? `Going to help ${m[1]}` : 'Going to help a teammate';
      case 'handover':
        if ((m = /^receiving from (\w+)/.exec(d))) return `Receiving items from ${m[1]}`;
        if ((m = /^single: (.*?): \d+\/\d+ kinds to (\w+)(?: — (.*))?$/.exec(d))) return `Handing ${m[1]} to ${m[2]}` + (m[3] ? ' — ' + clean(m[3]) : '');
        if ((m = /^to (\w+): (\d+) kinds?/.exec(d))) return `Handing ${m[2]} kind${m[2] === '1' ? '' : 's'} of items to ${m[1]}`;
        return 'Handing items over';
      case 'stash': m = /deposit (\d+) kinds? in my (\w+) warehouse/.exec(d); return m ? `Storing ${m[1]} kind${m[1] === '1' ? '' : 's'} of items in the ${m[2]} warehouse` : 'Storing items in the warehouse';
      case 'loot': m = /^loot to (\w+)/.exec(d); return m ? `Giving the loot to ${m[1]}` : 'Giving the loot away';
      case 'letters': m = /^(\d+) letters.*? to (\w+)/.exec(d); return m ? `Giving ${m[1]} event letters to ${m[2]}` : 'Giving event letters away';
      case 'clanhand': m = /(\d+) × (.*?) (?:to|from) (\w+)/.exec(d); return m ? `Clan item: ${m[1]} × ${m[2]} — ${m[3]}` : 'Clan item hand-over';
      case 'occupied': m = /^(.*?) is occupied by/.exec(d); return m ? `${place(m[1])} is taken by other players — picking another place` : 'The place is taken — picking another one';
      case 'delevel': m = /delevel (\d+) -> (\d+)/.exec(d); return m ? `Losing levels on purpose: ${m[1]} → ${m[2]}` : 'Losing levels on purpose';
      case 'quest': m = /^(\d+) (?:leg|ben) (\d+)\/(\d+):\s*(.*)$/.exec(d); return m ? `Quest step ${m[2]} of ${m[3]}` + (clean(m[4]) && !/undefined/.test(m[4]) ? ': ' + clean(m[4]).replace(/\s*->\s*/g, ' → ') : '') : 'Quest: ' + clean(d);
      case 'quest-hunt': return 'Hunting quest monsters: ' + clean(d);
      case 'quest retry': return cap(clean(d));
      case 'gear share': return 'Sharing gear in the team';
      case 'adena share': return 'Sharing adena with the team';
      case 'wait': return 'Waiting: ' + clean(d);
      case 'scout': m = /^(.*?): /.exec(d); return m ? `Scouting ${m[1]}` : 'Scouting';
      case 'circuit': return 'Raid circuit: ' + clean(d);
      default: return cap(a) + (d ? ': ' + clean(d) : '');
    }
  }
  function event(e) {
    e = e || {};
    let text = '';
    try { text = eventText(e); } catch (er) { text = cap(S(e.action)) + ': ' + clean(e.detail); }
    text = clean(text) || cap(S(e.action));
    const why = task(e.task);
    return { text, why: why && why.toLowerCase() !== text.toLowerCase() ? why : '', res: result(e), detail: [e.action + ': ' + S(e.detail), e.task ? 'while: ' + e.task : '', e.from ? 'from ' + e.from + (e.to ? ' → ' + e.to : '') : '', e.resultDetail ? 'result: ' + e.resultDetail : ''].filter(Boolean).join('\n') };
  }

  // ---------------------------------------------------------------------------------------------------- notes + orders
  function note(s) {
    let t = S(s).replace(/^\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s+/, '');
    let m;
    if ((m = /^priority: "(.*?)" \(P\d\) interrupts "(.*?)" \(P\d\)/.exec(t))) return `${cap(clean(m[1]))} first — "${clean(m[2])}" waits`;
    if ((m = /^navigation: wall-aware route to .*? — (\d+) waypoints/.exec(t))) return 'Planned a walk around the walls';
    if ((m = /^follow: no mobs here, \d+ from (\w+) — (.*)$/.exec(t))) return `No monsters here — walking back to ${m[1]}`;
    if ((m = /^\[letters\] hand-over to (\w+) FAILED: (.*?)(?: — next automatic try in (\d+) min)?$/.exec(t))) return `Could not hand the event letters to ${m[1]}` + (m[3] ? ` — tries again in ${m[3]} min` : '');
    if ((m = /^handover [a-z]+_[a-z0-9]+_m[a-z0-9]+: gave (\d+) kinds? to (\w+)/.exec(t))) return `Handed ${m[1]} kind${m[1] === '1' ? '' : 's'} of items to ${m[2]}`;
    if ((m = /^handover [a-z]+_[a-z0-9]+_m[a-z0-9]+: single: (.*?) -> (\w+): (\d+)\/(\d+) kinds OK/.exec(t))) return `Handed ${m[1]} to ${m[2]}`;
    if ((m = /^trade -> (\w+): (.*?) — (OK|.*)$/.exec(t))) return m[3] === 'OK' ? `Gave ${m[2]} to ${m[1]}` : `Trade with ${m[1]} did not finish (${resultText(m[3])})`;
    if ((m = /^auto-shots enabled/.exec(t))) return 'Automatic soulshots switched on';
    if ((m = /^town sell: selling (.*)$/.exec(t))) return `Selling ${m[1]}`;
    if ((m = /^order (o[0-9a-z]+) (.*?): (\w+)(?: - (.*))?$/.exec(t))) return `Order "${cmd(m[2])}": ${m[3]}${m[4] ? ' — ' + order(m[4], m[3], m[2]) : ''}`;
    return cap(clean(t));
  }
  /** an order recipient's reason in plain words; state = queued|delivered|acknowledged|running|done|failed|superseded|expired|cancelled */
  function order(why, state, c) {
    const w = S(why).trim();
    let m;
    if (/swarm\.js restarted while it ran/.test(w)) return /^#?!stop\b/i.test(S(c).trim()) ? 'the bot restarted afterwards — it stays stopped' : 'not finished: the bot restarted while it ran — send it again if you still want it';
    if ((m = /^replaced by (.*?) before it ran/.exec(w))) return `replaced by "${cmd(m[1])}" before it started`;
    if ((m = /^replaced by (.*)$/.exec(w))) return `replaced by "${cmd(m[1])}"`;
    if ((m = /^a newer order(?: \((.*)\))? replaced it/.exec(w))) return 'a newer order replaced it';
    if ((m = /^older than (\d+) min when I could read it/.exec(w))) return `too old (over ${m[1]} min) when the character came online — not run`;
    if (/^logging in \/ not in the game yet/.test(w)) return 'waiting until the character is in the game';
    if (/^swarm\.js is starting/.test(w)) return 'waiting until the bot has started';
    if (/is not in CONFIG\.roster/.test(w)) return 'this character is not set up for the bots (not in your account list)';
    if ((m = /^it came from (\w+), but my leader is (\w+)/.exec(w))) return `sent through ${m[1]}, but its party leader is ${m[2]} — not run`;
    if (/^my order state file was unreadable/.test(w)) return 'could not be checked safely after a problem — send it again';
    if (/^no end report after/.test(w)) return 'treated as finished (no news for an hour)';
    if (/^finished \(nothing runs for it any more\)/.test(w)) return 'finished';
    if ((m = /^done: (.*)$/.exec(w))) return clean(m[1]);
    if (/^cancelled on the dashboard/.test(w)) return 'you cancelled it';
    if (/^received through party chat too/.test(w)) return 'it already ran from party chat';
    if (/^error: /.test(w)) return 'something went wrong in the bot (details in Advanced mode)';
    return clean(w);
  }
  const STATE_WORD = { queued: 'waiting', delivered: 'waiting', acknowledged: 'started', running: 'working on it', done: 'done', failed: 'not done', superseded: 'replaced', expired: 'too old', cancelled: 'cancelled', unknown: '?' };
  const STATE_KIND = { queued: 'waiting', delivered: 'waiting', acknowledged: 'working', running: 'working', done: 'ok', failed: 'problem', superseded: 'off', expired: 'off', cancelled: 'off', unknown: 'off' };

  const Plain = { clean, place, task, event, eventText, result, resultText, note, order, cmd, dist, sys, names, STATE_WORD, STATE_KIND, SYS_OK };
  if (typeof module !== 'undefined' && module.exports) module.exports = Plain;
  if (root) root.Plain = Plain;
})(typeof window !== 'undefined' ? window : null);
