// PARTY PLAN — shared logic (owner 2026-10-13: "It would be cool if you could make a plan for a character and choose e.g. quests along the
// way you make. It must be a lovely way to do it."). ONE file for the dashboard (window.PlanLogic, used by Dashboard/partyplan.js) and node
// (module.exports: Dashboard/partyplan_api.js + docs/plan/tools/test_party_plan*.js). No DOM, no host calls.
//
// A plan = an ordered list of steps a party follows when it is STARTED (run switch ON) and the plan is switched on ("Use this plan when I
// press Start"). The bot side is Scripts_dev/swarm.js PARTYPLAN-PURE (+ its host part): the leader runs the current step, checks its own condition
// (level reached / quest completed / class changed / town reached / order finished), goes on to the next, and stops at "wait for my order"
// or at the end. File: Scripts/data/party_plans.json (written ONLY by Dashboard/partyplan_api.js: lock + rev check + history + atomic write).
// Progress: Logs/plan_progress_<leader>.json (written ONLY by the leader's window).
//
//   { v: 1, parties: { <leader>: { name, on, steps: [step], at, by, template } }, templates: { <id>: { name, steps, note, at, by } } }
//   step = { id, kind, note? } +
//     level  { to: 2..85, spot: { mode: 'party' (the party's own hunting place) | 'auto' (the leader picks) | 'manual' + the party_spots.json
//              fields: kind zone|datapack|rooms|field, spot, dungeon, roomId, roomIds, region, areaIds, order } }
//     quest  { quest: <id>, name, mode: 'party' (together, the leader drives) | 'solo' (each named character alone; who empty = everyone),
//              who: [names], repeat: 1..99, onFail: 'stop' | 'skip' }
//     class  { who: [names] (empty = everyone) } — ONLY the next step of an APPROVED class plan (Classes page); no plan = never changed
//     town   { town: Giran | Gludin | ... }      supply {}      gear {}
//     raid   { boss: <npc id>, name, level, onFail }            wait { note }
(function (root) {
  'use strict';
  const KINDS = ['level', 'quest', 'class', 'town', 'supply', 'gear', 'raid', 'wait', 'academy'];   // ACADEMY-2026-10-21: academy { act: join | funds | buy | graduate, set }
  const INFO = {
    level: { icon: '⚔️', label: 'Level up', hint: 'Hunt until the party reaches a level' },
    quest: { icon: '📜', label: 'Do a quest', hint: 'One quest — rewards shown' },
    class: { icon: '⭐', label: 'Class change', hint: 'Only with an approved class plan' },
    town: { icon: '🏰', label: 'Go to a town', hint: 'The whole party travels there' },
    supply: { icon: '🧪', label: 'Supplies', hint: 'Scrolls, shots and potions in Giran' },
    gear: { icon: '🛡️', label: 'Gear up', hint: 'Buy better gear in Giran' },
    raid: { icon: '🐉', label: 'Raid boss', hint: 'Optional: fight one raid boss' },
    wait: { icon: '✋', label: 'Wait for my order', hint: 'The party stops here until you say Continue' },
    academy: { icon: '🎓', label: 'Academy', hint: 'Academy mage steps (made by the Academy pipeline)' },
  };
  // = Scripts_dev/swarm.js TOWN_CMD keys (the !town order)
  const TOWNS = ['Giran', 'Gludin', 'Gludio', 'Dion', 'Oren', 'Aden', 'Hunters', 'Heine', 'Goddard', 'Rune', 'Schuttgart'];
  const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
  const MAX_STEPS = 60;
  const int = (v, lo, hi) => { if (v === null || v === undefined || v === '') return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  const str = (v, n) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/[<>]/g, '').trim().slice(0, n || 120);
  const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  let SEQ = 0;
  function newId() { return 's' + Date.now().toString(36) + (++SEQ).toString(36) + Math.random().toString(36).slice(2, 5); }
  function fmt(n) { n = Number(n) || 0; return n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'k' : String(Math.round(n)); }
  function names(list) { const L = (list || []).filter(Boolean); return L.length <= 1 ? (L[0] || '') : L.slice(0, -1).join(', ') + ' and ' + L[L.length - 1]; }

  // ------------------------------------------------------------------------------------------------------------- normalise (the file)
  function normSpot(s) {
    const o = obj(s);
    const mode = o.mode === 'auto' || o.mode === 'manual' ? o.mode : 'party';
    if (mode !== 'manual') return { mode };
    const kind = ['zone', 'datapack', 'rooms', 'field'].includes(o.kind) ? o.kind : null;
    if (!kind) return { mode: 'party' };
    const out = { mode, kind, spot: str(o.spot) };
    if (kind === 'rooms') {
      out.dungeon = str(o.dungeon || o.spot); out.spot = out.dungeon; out.roomId = str(o.roomId || 'any', 60) || 'any';
      if (Array.isArray(o.roomIds) && o.roomIds.length) { out.roomIds = o.roomIds.map(x => str(x, 60)).filter(Boolean).slice(0, 40); out.roomId = out.roomIds[0] || 'any'; out.order = o.order === 'rotate' ? 'rotate' : 'nearest'; }
    }
    if (kind === 'field') {
      out.region = str(o.region, 60); out.areaIds = (Array.isArray(o.areaIds) ? o.areaIds : []).map(x => str(x, 60)).filter(Boolean).slice(0, 40); out.order = o.order === 'rotate' ? 'rotate' : 'nearest';
      if (!out.region || !out.areaIds.length) return { mode: 'party' };
    }
    if (!out.spot) return { mode: 'party' };
    const a = int(o.levelMin, 1, 99), b = int(o.levelMax, 1, 99);
    if (a != null) out.levelMin = a; if (b != null) out.levelMax = b;
    if (o.override === true) out.override = true;                     // ACADEMY-2026-10-21: the owner accepted the level gap (party_spots.json override)
    if (typeof o.stay === 'boolean') out.stay = o.stay;
    return out;
  }
  function normWho(w) { return Array.isArray(w) ? [...new Set(w.map(String).filter(n => NAME_RE.test(n)))].slice(0, 12) : []; }
  function normStep(s) {
    if (!s || typeof s !== 'object' || !KINDS.includes(s.kind)) return null;
    const out = { id: /^[A-Za-z0-9_-]{2,40}$/.test(String(s.id || '')) ? String(s.id) : newId(), kind: s.kind };
    const note = str(s.note, 200); if (note) out.note = note;
    const who = normWho(s.who);
    switch (s.kind) {
      case 'level': out.to = int(s.to, 2, 85); if (!out.to) return null; out.spot = normSpot(s.spot); break;
      case 'quest':
        out.quest = int(s.quest, 1, 99999); if (!out.quest) return null;
        out.name = str(s.name, 80); out.mode = s.mode === 'solo' || who.length ? 'solo' : 'party';
        if (who.length) out.who = who;
        out.repeat = int(s.repeat, 1, 99) || 1; out.onFail = s.onFail === 'skip' ? 'skip' : 'stop'; break;
      case 'class': if (who.length) out.who = who; break;
      case 'town': out.town = TOWNS.find(t => t.toLowerCase() === String(s.town || '').toLowerCase().replace(/^\./, '')) || 'Giran'; break;
      case 'academy': out.act = ['join', 'funds', 'buy', 'graduate'].includes(s.act) ? s.act : null; if (!out.act) return null; if (out.act === 'buy') out.set = /^[A-Za-z0-9_]{1,20}$/.test(String(s.set || '')) ? String(s.set) : 'start'; break;
      case 'raid': out.boss = int(s.boss, 1, 9999999); if (!out.boss) return null; out.name = str(s.name, 80); { const l = int(s.level, 1, 99); if (l != null) out.level = l; } out.onFail = s.onFail === 'skip' ? 'skip' : 'stop'; break;
      default: break;
    }
    return out;
  }
  function normSteps(list) {
    const seen = new Set(), out = [];
    (Array.isArray(list) ? list : []).forEach(s => { const n = normStep(s); if (!n || out.length >= MAX_STEPS) return; if (seen.has(n.id)) n.id = newId(); seen.add(n.id); out.push(n); });
    return out;
  }
  function normPlan(p) {
    const o = obj(p);
    const out = { name: str(o.name, 60) || 'My plan', on: o.on === true, steps: normSteps(o.steps) };
    ['at', 'by', 'template'].forEach(k => { if (o[k]) out[k] = str(o[k], 60); });
    return out;
  }
  function normFile(j) {
    const o = obj(j), P = obj(o.parties), T = obj(o.templates), out = Object.assign({}, o, { v: 1, parties: {}, templates: {} });
    Object.keys(P).forEach(k => { if (NAME_RE.test(k) && !k.startsWith('_')) out.parties[k] = normPlan(P[k]); });
    Object.keys(T).forEach(k => { if (/^[a-z0-9-]{1,40}$/.test(k)) { const t = obj(T[k]); out.templates[k] = { name: str(t.name, 60) || k, steps: normSteps(t.steps), note: str(t.note, 200), at: str(t.at, 40), by: str(t.by, 40) }; } });
    return out;
  }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'plan'; }

  // ------------------------------------------------------------------------------------------------------------- the cursor (= swarm.js PARTYPLAN-PURE planCursor)
  /** prog = { stepId, done: { <stepId>: { at, result } } } -> the index of the step to run now (steps.length = finished) */
  function planCursor(plan, prog) {
    const steps = (plan && Array.isArray(plan.steps)) ? plan.steps : [], P = prog || {}, done = obj(P.done);
    const open = (from) => { for (let i = Math.max(0, from); i < steps.length; i++) if (!done[steps[i].id]) return i; return steps.length; };
    if (P.stepId) { const i = steps.findIndex(s => s && s.id === P.stepId); if (i >= 0) return done[P.stepId] ? open(i + 1) : i; }
    return open(0);
  }

  // ------------------------------------------------------------------------------------------------------------- plain sentences
  function spotText(sp) {
    const s = obj(sp);
    if (s.mode === 'auto') return 'where the leader picks for the level';
    if (s.mode !== 'manual') return "at the party's own hunting place";
    if (s.kind === 'rooms') return `in ${s.dungeon || s.spot}${s.roomIds && s.roomIds.length > 1 ? ` (${s.roomIds.length} rooms)` : s.roomId && s.roomId !== 'any' ? ` (room ${s.roomId.replace(/^[a-z]+-/, '')})` : ''}`;
    if (s.kind === 'field') return `in ${s.spot}${s.areaIds && s.areaIds.length > 1 ? ` (${s.areaIds.length} areas)` : ''}`;
    return `in ${String(s.spot || '?').replace(/\s*\((?:route|team|trio)[^)]*\)\s*$/i, '').replace(/^(?:Trio|Team \d+|Party \d+[^:]*):\s*/i, '')}`;
  }
  /** the reward of a quest row (Dashboard/questpage_api.js listRows): "163k adena, 320k exp, Wondrous Cubic" */
  function rewardText(row) {
    if (!row) return '';
    const p = [];
    if (row.adena) p.push(`${row.adena} adena`);
    if (Number(row.exp) > 0) p.push(`${fmt(row.exp)} exp`);
    (row.rewards || []).slice(0, 2).forEach(it => { if (it && it.name) p.push(it.name); });
    return p.join(', ');
  }
  function questWhere(row) { return row ? (row.town || row.npc || '') : ''; }
  /** one step -> a plain sentence. ctx = { quests: { <id>: row }, members: [names] } */
  function stepText(step, ctx) {
    const s = obj(step), C = obj(ctx), Q = obj(C.quests);
    switch (s.kind) {
      case 'level': return `Level ${spotText(s.spot)} until level ${s.to}`;
      case 'quest': {
        const row = Q[s.quest] || null, nm = s.name || (row && row.name) || `quest ${s.quest}`, w = questWhere(row), r = rewardText(row);
        const who = s.mode === 'solo' ? (s.who && s.who.length ? ` — ${names(s.who)} alone` : ' — each character alone') : '';
        return `Do "${nm}"${w ? ` (${w})` : ''}${s.repeat > 1 ? ` ×${s.repeat}` : ''}${who}${r ? ` — reward ${r}` : ''}`;
      }
      case 'class': return `Change class${s.who && s.who.length ? ` (${names(s.who)})` : ''} — only characters with an approved class plan`;
      case 'town': return `Go to ${s.town || 'Giran'}`;
      case 'supply': return 'Buy supplies in Giran (scrolls, shots, potions) and hand them out';
      case 'gear': return 'Go to Giran and buy better gear';
      case 'raid': return `Fight the raid boss ${s.name || '#' + s.boss}${s.level ? ` (level ${s.level})` : ''}`;
      case 'wait': return `Wait for my order${s.note ? ` — ${s.note}` : ''}`;
      case 'academy': return { join: 'Academy: go to Giran and get invited into the clan Academy', funds: 'Academy: get adena from the givers for the kit', buy: `Academy: buy the ${s.set === 'level20' ? 'level-20 kit (Devotion set, Common weapon, D spiritshots) and wear it' : 'start kit (No-Grade spiritshots)'}`, graduate: 'Academy: graduated — log out, the account makes the next academy character' }[s.act] || 'Academy step';
      default: return '?';
    }
  }
  /** the first steps as one sentence: "Level in Ruins of Despair until level 20, then do 'A Special Order' (Giran) — reward 163k adena" */
  function planSentence(plan, ctx, n) {
    const st = ((plan && plan.steps) || []).slice(0, n || 2).map(s => stepText(s, ctx));
    return st.map((t, i) => (i ? t.charAt(0).toLowerCase() + t.slice(1) : t)).join(', then ');
  }

  // ------------------------------------------------------------------------------------------------------------- who may take a quest
  const lc = (s) => String(s || '').toLowerCase();
  /** row = /api/quests row (req, lmin, lmax); m = { name, level, race, classEnum } -> { ok: 'yes'|'no'|'maybe', why } */
  function questEligible(row, m, level) {
    const why = [], maybe = [], r = obj(row && row.req), lv = Number(level != null ? level : m && m.level) || 0;
    if (row && row.lmin != null && lv && lv < row.lmin) why.push(`level ${lv} < ${row.lmin}`);
    if (row && row.lmax != null && lv > row.lmax) why.push(`level ${lv} > ${row.lmax}`);
    const race = (m && m.race) || '';
    if (r.races && r.races.length) { if (!race) maybe.push('race unknown'); else if (!r.races.includes(race)) why.push(`only ${r.races.map(x => lc(x).replace('_', ' ')).join(' / ')}`); }
    if (r.notRaces && r.notRaces.length && race && r.notRaces.includes(race)) why.push(`not for ${lc(race).replace('_', ' ')}`);
    const ce = lc(m && m.classEnum);
    if (r.classes && r.classes.length) { if (!ce) maybe.push('class unknown'); else if (!r.classes.some(x => lc(x) === ce)) why.push('another class only'); }
    if (r.notClasses && r.notClasses.length && ce && r.notClasses.some(x => lc(x) === ce)) why.push('not for this class');
    if (r.categories && r.categories.length) maybe.push('class group');
    if (r.quests && r.quests.length) maybe.push(`needs quest ${r.quests.map(x => x.id).join(', ')} first`);
    if (r.items && r.items.length) maybe.push('needs an item');
    if (r.noble) why.push('noblesse only'); if (r.clan) maybe.push('clan'); if (r.subclass) why.push('subclass only');
    return { ok: why.length ? 'no' : maybe.length ? 'maybe' : 'yes', why: why.concat(maybe).join(', ') };
  }

  // ------------------------------------------------------------------------------------------------------------- checks (warnings, never a refusal)
  /** ctx = { members: [{ name, level, race, classEnum, cp: { status, needLevel, nextName } }], quests: { id: row }, raids: { id: { level } },
   *  startLevel } -> [{ levelAt, errors: [], warns: [] }] per step + { endLevel } */
  function checkPlan(plan, ctx) {
    const C = obj(ctx), M = C.members || [], Q = obj(C.quests), R = obj(C.raids);
    let lvl = Number(C.startLevel) || (M.length ? Math.min(...M.map(m => Number(m.level) || 1)) : 1);
    const out = [];
    let waited = false;
    ((plan && plan.steps) || []).forEach((s, i) => {
      const e = [], w = [], at = lvl;
      const inScope = (s.who && s.who.length) ? M.filter(m => s.who.includes(m.name)) : M;
      if (s.who && s.who.length) { const miss = s.who.filter(n => !M.some(m => m.name === n)); if (miss.length) w.push(`${names(miss)} ${miss.length === 1 ? 'is' : 'are'} not in this party`); }
      if (s.kind === 'level') {
        if (s.to <= lvl) w.push(`the party is already level ${lvl} here — this step ends at once`);
        const sp = obj(s.spot);
        if (sp.mode === 'manual' && sp.levelMax != null && s.to > sp.levelMax + 2) w.push(`${sp.spot} is for levels ${sp.levelMin || '?'}–${sp.levelMax}: the monsters give little exp near level ${s.to}`);
        if (sp.mode === 'manual' && sp.levelMin != null && lvl < sp.levelMin - 2) w.push(`${sp.spot} is for levels ${sp.levelMin}–${sp.levelMax || '?'}: dangerous at level ${lvl}`);
        lvl = Math.max(lvl, s.to);
      } else if (s.kind === 'quest') {
        const row = Q[s.quest];
        if (!row) e.push('unknown quest (not in the quest list)');
        else {
          if (row.lmin != null && lvl < row.lmin) w.push(`needs level ${row.lmin} — the party is about ${lvl} here (put a level step before it)`);
          if (row.lmax != null && lvl > row.lmax) w.push(`only up to level ${row.lmax} — the party is about ${lvl} here`);
          if (row.parse === 'manual') w.push('this quest has a step the bots cannot do by themselves — it will stop there');
          else if (row.parse === 'partial') w.push('not every step of this quest is known — it may stop half-way');
          const no = inScope.map(m => ({ m, el: questEligible(row, m, Math.max(lvl, Number(m.level) || 0)) })).filter(x => x.el.ok === 'no' && !/^level/.test(x.el.why));
          if (no.length) w.push(`${names(no.map(x => x.m.name))} cannot take it (${no[0].el.why})`);
          if (s.mode === 'party' && row.type === 'daily') w.push('a daily quest: once a day');
        }
      } else if (s.kind === 'class') {
        const noPlan = inScope.filter(m => m.cp && ['missing', 'needs-approval', 'invalid', 'off-plan', 'ambiguous'].includes(m.cp.status));
        const withPlan = inScope.filter(m => m.cp && ['ready', 'waiting', 'done'].includes(m.cp.status));
        if (noPlan.length) w.push(`${names(noPlan.map(m => m.name))}: no approved class plan — will NOT change class (Classes page)`);
        if (!withPlan.length && inScope.length) w.push('nobody here has an approved class plan — this step changes nothing');
        // TESTERFIX-2026-10-19 (Vykaax: "it got stuck at lvl 20 trying to perform a lvl 40 class change"): only a change 1-2 levels away holds the step
        // (= the step sits a little early); a change far away = nothing is due here, the step ends at once (= swarm.js planClassDecide)
        const due = (m) => m.cp.needLevel - Math.max(lvl, Number(m.level) || 0);
        const low = withPlan.filter(m => m.cp.status === 'waiting' && m.cp.needLevel && due(m) > 0 && due(m) <= 2);
        if (low.length) w.push(`${names(low.map(m => `${m.name} (${m.cp.nextName} at ${m.cp.needLevel})`))} — the party is about ${lvl} here: this step is skipped there (the automatic class change does it at that level; PLANCLASS-2026-10-23) — put a level step before it if you want it here`);
        const later = withPlan.filter(m => m.cp.status === 'waiting' && m.cp.needLevel && due(m) > 2);
        if (later.length && later.length === withPlan.length) w.push(`nothing to change at level ${lvl} (next: ${names(later.map(m => `${m.name} → ${m.cp.nextName} at ${m.cp.needLevel}`))}) — this step ends at once`);
      } else if (s.kind === 'supply' && plan.steps[i + 1] && plan.steps[i + 1].kind === 'gear') {
        w.push('supplies before Gear up: the shots are bought for the old weapon grade — move Gear up above Supplies');   // TESTERFIX-2026-10-19
      } else if (s.kind === 'raid') {
        const bl = Number(s.level || (R[s.boss] && R[s.boss].level)) || 0;
        if (bl && lvl > bl + 8) w.push(`the party (about ${lvl}) is more than 8 levels above the boss (${bl}): the raid curse`);
        else if (bl && lvl < bl - 3) w.push(`the boss (${bl}) is stronger than the party (about ${lvl})`);
      } else if (s.kind === 'wait') waited = true;
      out.push({ levelAt: at, levelAfter: lvl, errors: e, warns: w, afterWait: waited && s.kind !== 'wait' });
    });
    return { steps: out, endLevel: lvl };
  }

  // ------------------------------------------------------------------------------------------------------------- suggest a plan
  const CLASS_LEVELS = [20, 40, 76];
  /** "Gludin -> Abandoned Camp" -> "Gludin" (a main town only) */
  function viaTown(v) { const t = String(v || '').split('->')[0].trim(); return TOWNS.includes(t) ? t : ''; }
  /** inp = { leader, members: [...as checkPlan], zones: [/api/partyspot options.zones], datapack: [options.datapack], quests: [rows],
   *  from, to } -> { steps, notes: [] }. Zones of THIS party (teams contains the leader) come before 'all' zones; datapack spots fill gaps;
   *  quests: one-time, every step known, no prerequisites, best adena + exp, at most 2 per level band; class change at 20 / 40 / 76 followed
   *  by better gear, then supplies (shots for the new grade) in Giran; ends with "wait for my order". Everything is editable afterwards. */
  function suggestPlan(inp) {
    const I = obj(inp), M = I.members || [], leader = String(I.leader || '');
    const lows = M.map(m => Number(m.level) || 1);
    const from = Math.max(1, Math.min(84, Number(I.from) || (lows.length ? Math.min(...lows) : 1)));
    const to = Math.max(from + 1, Math.min(85, Number(I.to) || 40));
    const zones = (I.zones || []).filter(z => z && z.name && z.enabled !== false && z.levelMin != null && z.levelMax != null);
    const mine = (z) => (Array.isArray(z.teams) ? z.teams : ['all']).some(t => t === leader);
    const forAll = (z) => (Array.isArray(z.teams) ? z.teams : ['all']).includes('all');
    const dp = (I.datapack || []).filter(s => s && s.name && s.levelMin != null && s.levelMax != null && !/necropolis|catacomb/i.test(s.name));   // Seven Signs places: never suggested
    const junk = (it) => /pet exchange|lure|ticket/i.test(String(it && it.name || ''));
    const Q = (I.quests || []).filter(q => q && q.type === 'one-time' && q.parse === 'full' && q.lmin != null && !/^(path (of|to) |pailaka)/i.test(q.name || '') &&
      !(q.req && (q.req.quests || q.req.items || q.req.noble || q.req.clan || q.req.subclass || q.req.categories)) &&
      (Number(q.adenaV) >= 3000 || Number(q.exp) >= 15000 || (q.rewards || []).some(it => !junk(it))));
    const maxQuests = Number(I.maxQuests) >= 0 ? Number(I.maxQuests) : 12;
    let nQ = 0;
    const steps = [], notes = [], used = new Set();
    const brk = CLASS_LEVELS.filter(b => b > from && b <= to);
    const nextBreak = (l) => brk.find(b => b > l) || to;
    const pickZone = (l) => {
      const fit = (z) => z.levelMin <= l && l <= z.levelMax;
      const a = zones.filter(z => fit(z) && mine(z)), b = zones.filter(z => fit(z) && forAll(z));
      const best = (L) => L.sort((x, y) => (y.levelMin - x.levelMin) || (x.levelMax - y.levelMax))[0] || null;
      const z = best(a) || best(b);
      if (z) return { mode: 'manual', kind: 'zone', spot: z.name, levelMin: z.levelMin, levelMax: z.levelMax, town: viaTown(z.via) };
      const d = dp.filter(s => s.levelMin <= l && l <= s.levelMax).sort((x, y) => (/^Area @/.test(x.name) - /^Area @/.test(y.name)) || (Number(y.mobs) || 0) - (Number(x.mobs) || 0))[0];   // a named place before an 'Area @x,y'
      if (d) return { mode: 'manual', kind: 'datapack', spot: d.name, levelMin: d.levelMin, levelMax: d.levelMax, town: viaTown(d.via) };
      return null;
    };
    // quests near the hunting place's town / a main town first (a racial village far away only when it pays a lot)
    const pickQuests = (lo, hi, town) => {
      if (nQ >= maxQuests) return [];
      const c = Q.filter(q => !used.has(q.id) && q.lmin > lo && q.lmin <= hi && (q.lmax == null || q.lmax >= hi)).map(q => {
        const el = M.map(m => ({ m, e: questEligible(q, m, hi) })), ok = el.filter(x => x.e.ok !== 'no').map(x => x.m.name);
        const qt = String(q.town || '').split('/')[0].trim(), near = town && qt === town ? 2 : TOWNS.includes(qt) ? 1 : 0.4;
        return { q, ok, score: ((Number(q.adenaV) || 0) + (Number(q.exp) || 0) / 15 + ((q.rewards || []).some(it => !junk(it)) ? 3000 : 0)) * near };
      }).filter(x => x.ok.length).sort((a, b) => (b.ok.length === M.length) - (a.ok.length === M.length) || b.score - a.score);
      const out = c.slice(0, Math.min(2, maxQuests - nQ)); nQ += out.length; return out;
    };
    let L = from, prev = from - 6, guard = 0;
    while (L < to && guard++ < 40) {
      const sp0 = pickZone(L);
      pickQuests(prev, L, sp0 && sp0.town).forEach(x => {
        used.add(x.q.id);
        const all = !M.length || x.ok.length === M.length;
        steps.push(normStep({ kind: 'quest', quest: x.q.id, name: x.q.name, mode: all ? 'party' : 'solo', who: all ? [] : x.ok, repeat: 1, onFail: 'skip' }));
      });
      const nb = nextBreak(L), sp = sp0;
      let t = sp ? Math.max(L + 2, sp.levelMax) : Math.min(nb, L + 5);
      if (t >= nb - 1) t = nb;
      t = Math.min(t, nb, to); if (t <= L) t = Math.min(to, L + 1);
      const last = steps[steps.length - 1];
      if (last && last.kind === 'level' && sp && last.spot.mode === 'manual' && last.spot.spot === sp.spot) last.to = t;   // same place again: one step
      else steps.push(normStep({ kind: 'level', to: t, spot: sp || { mode: 'auto' } }));
      if (!sp) notes.push(`levels ${L}–${t}: no hunting place on the party's route — the leader picks one`);
      prev = L; L = t;
      if (brk.includes(L)) {
        steps.push(normStep({ kind: 'class' }));
        steps.push(normStep({ kind: 'gear' }));      // TESTERFIX-2026-10-19 (Vykaax: "Supplies should be purchased after Gear Up, otherwise the party is buying outdated shots")
        steps.push(normStep({ kind: 'supply' }));
      }
    }
    steps.push(normStep({ kind: 'wait', note: `plan to level ${to} finished` }));
    return { steps: steps.filter(Boolean), notes, from, to };
  }

  /** a template / another party's plan for these members: new step ids; named characters not in the party are dropped; a step that only
   *  named other characters is left out -> { steps, dropped: [sentences] } */
  function applySteps(steps, members) {
    const has = new Set((members || []).map(String)), out = [], dropped = [];
    normSteps(JSON.parse(JSON.stringify(steps || []))).forEach(s => {
      if (s.who && s.who.length) {
        const keep = s.who.filter(n => has.has(n));
        if (!keep.length) { dropped.push(stepText(s) + ' (only for characters of another party)'); return; }
        if (keep.length < s.who.length) dropped.push(`${stepText(s)}: ${names(s.who.filter(n => !has.has(n)))} left out`);
        s.who = keep;
      }
      s.id = newId(); out.push(s);
    });
    return { steps: out, dropped };
  }

  // ------------------------------------------------------------------------------------------------------------- the party card line
  const STATUS = { running: 'running', waiting: 'waiting', blocked: 'blocked', paused: 'paused', done: 'done', idle: 'idle' };
  /** plan + progress -> { kind: 'run'|'wait'|'bad'|'pause'|'done'|'ready'|'off', text } (one line, fixed height on the party card) */
  function progressLine(plan, prog, ctx, runOn) {
    if (!plan || !plan.steps || !plan.steps.length) return null;
    const n = plan.steps.length, P = prog || {}, idx = planCursor(plan, P), step = plan.steps[Math.min(idx, n - 1)];
    const st = String(P.status || 'idle'), nm = plan.name ? `"${plan.name}"` : '';
    const cur = idx < n ? `step ${idx + 1}/${n}: ${stepText(step, ctx)}` : '';
    if (idx >= n || st === 'done') return { kind: 'done', text: `✓ Plan ${nm} finished (${n} step${n === 1 ? '' : 's'})` };
    if (!plan.on) return { kind: 'off', text: `📋 Plan ${nm}: not used — Start does the party's normal activity (switch the plan on in 📋 Plan)` };
    if (st === 'running' && runOn !== false) return { kind: 'run', text: `📋 Plan ${cur}` };
    if (st === 'waiting') return { kind: 'wait', text: `✋ Plan waits for you at ${cur} — press Continue in 📋 Plan` };
    if (st === 'blocked') return { kind: 'bad', text: `⚠ Plan stopped at ${cur}${P.why ? ' — ' + P.why : ''}` };
    if (st === 'paused' || (st === 'running' && runOn === false)) return { kind: 'pause', text: `⏸ Plan paused at ${cur}${P.why ? ' — ' + P.why : ''}` };
    return { kind: 'ready', text: `📋 Plan ${nm} ready — Start begins at ${cur}` };
  }

  const API = { KINDS, INFO, TOWNS, MAX_STEPS, STATUS, newId, fmt, names, normSpot, normStep, normSteps, normPlan, normFile, slug, planCursor, spotText, rewardText,
    stepText, planSentence, questEligible, checkPlan, suggestPlan, applySteps, progressLine };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.PlanLogic = API;
})(typeof window !== 'undefined' ? window : this);
