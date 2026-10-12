// HOST TOUCH AUDIT (2026-10-12, docs/plan/memory_2026-10-12.md): a STATIC estimate of how many .NET host objects swarm.js touches per minute,
// per timer job (setInterval = SCHED job) and its period, ranked by touches x runs per minute -> docs/plan/host_touch_audit.md.
// Usage: node docs/plan/tools/host_touch_audit.js [swarm.js] [out.md]     (default Scripts_dev/swarm.js -> docs/plan/host_touch_audit.md)
//        node docs/plan/tools/host_touch_audit.js --json [swarm.js]       (prints the rows as JSON, for comparisons before/after a patch)
// No dependencies: its own small JS lexer (comments, strings, template literals with ${} nesting, regex literals).
//
// MODEL (an estimate, not a measurement):
// - touch = one call across the JS <-> .NET bridge: a property read on a host object (Me.X, Options.Y, an entity field inside a host
//   forEach), a host collection item handed to JS, a lookup (GetItemByID), a global host getter (Target, IsInCombat, ...), an API call
//   (Send.*, File.*, App.*). Every touch that returns an OBJECT goes through ClearScript's HostItem wrapper; ClearScript keeps a cache
//   (hostObjectHostItemCache, fastHostItemCache in ClearScript.Core/V8.dll), so the SAME live object reuses its proxy while the old one is
//   still alive in V8. fresh = touches that marshal a NEW .NET object each time (a copy collection from MobsList/NpcList/CharList or a host
//   .filter(), boxed enums/structs such as crtType, Point3D, item Type/Grade, `new Point3D`): those always make a new HostItem.
// - host collection loops count their estimated size (SIZE below) and every field read on the loop variable inside the callback.
// - snapshot helpers (snapMobs/snapNpcs/snapChars/meSnap/hostSnap.*) = 1 touch per call (a cached JSON string at most every 200-250 ms).
// - a catch block is not counted (error path); loops multiply what is inside them (JS loops x4, snapshot loops x their size); a block under if/else counts x0.5 per level (it does not
//   run every time); calls to functions defined in the file are followed (x their loop/branch factor, cycles cut, depth <= 4).
// - a self-cached callee ("if (now() - X.at < N) return ..." at its top) counts once per call site x min(1, 1000/N), not per loop pass.
// - async callees are NOT followed: such a flow runs at its own pace (its awaits/sleeps), SCHED never stacks an async job while its
//   previous run is busy; the rate of the flows themselves is not estimated here. A loop with an await inside counts x1 (paced).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const args = process.argv.slice(2), asJson = args.includes('--json');
const pos = args.filter(a => a !== '--json');
const SRC = pos[0] || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const OUT = pos[1] || path.join(ROOT, 'docs', 'plan', 'host_touch_audit.md');

// ---------- estimated sizes (Logs/sched_top.log 2026-10-12: ~170 creatures around a leader in town; a full party of 9) ----------
const SIZE = { CreaturesList: 170, MobsList: 40, NpcList: 60, CharList: 70, PartyList: 8, Inventory: 80, ItemsList: 80, SkillsList: 70,
  BuffsList: 30, DropList: 5, PetList: 1, QuestList: 10, BuyList: 30, PetInventory: 10, MacroList: 5 };
const GENERIC = 4;                                                         // a plain JS array / object loop
const SNAPSIZE = { snapMobs: 40, snapNpcs: 60, snapChars: 70 };
const HOSTSNAPSIZE = { party: 8, inv: 80, skills: 70, buffs: 30 };
const COPY_GETTERS = new Set(['MobsList', 'NpcList', 'CharList']);          // the prelude getter builds a NEW collection (CreaturesList.filter<T>)
const ITER = new Set(['forEach', 'filter', 'find', 'some', 'map', 'every', 'reduce', 'findIndex', 'flatMap', 'sort']);
const LOOKUP = new Set(['GetItemByID', 'GetItemByName', 'GetItemByObjectID', 'GetItemByObjId', 'GetItemByTemplateId']);
const GLOBAL_GETTERS = new Set(['IsConnected', 'IsInCombat', 'IsEnabled', 'IsAttacking', 'IsSitting', 'CurrentZone', 'IsFollowModeOn',
  'IsFollowMaster', 'IsInParty', 'IsPartyLeader', 'FollowChar', 'LastHTML', 'ShopId', 'LastBuyListId']);
const GLOBAL_FUNCS = new Set(['IsCharacterReady', 'Select', 'Attack', 'UseItem', 'GoToPoint', 'MoveToPoint', 'StartCombat', 'StopCombat',
  'EnableBot', 'DisableBot', 'RunCommand', 'SayToParty', 'Tell', 'ClickLink', 'BuffLow', 'IsMe', 'ItemCount', 'FindSkillId', 'FindItemId',
  'NpcNearby', 'BuyItem', 'GetQuestState', 'HasQuest', 'SetCombatRange', 'SetCombatSquareZone', 'UseCombatSquareZone', 'FindPath',
  'FindPathSync', 'LoadCombatMap', 'Distance', 'GoToNpc']);
const API_OBJ = new Set(['Send', 'File', 'App', 'Directory', 'L2Timer', 'Context']);
const FRESH_FIELDS = new Set(['crtType', 'Point', 'Point3D', 'dPoint3D', 'Buffs', 'Type', 'Grade', 'BodyPartTypes', 'AttackElementType',
  'OperateType', 'StoreType', 'Clan', 'Template', 'ExpertiseLevel', 'Race', 'Sex', 'ClassType', 'DyeList', 'Ingredients', 'Products', 'Skills']);
const KW_REGEX_BEFORE = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

// ---------- lexer ----------
function lex(src) {
  const toks = [], n = src.length, stack = [];       // stack: '{' normal brace, 'T' = ${ inside a template
  let i = 0, line = 1;
  const push = (t, v, s) => toks.push({ t, v, s, line });
  const prevSig = () => toks.length ? toks[toks.length - 1] : null;
  const regexAllowed = () => {
    const p = prevSig(); if (!p) return true;
    if (p.t === 'num' || p.t === 'str' || p.t === 're' || p.t === 'tpl') return false;
    if (p.t === 'id') return KW_REGEX_BEFORE.has(p.v);
    return !(p.v === ')' || p.v === ']');
  };
  const scanTemplate = () => {                         // i at the char after ` or after the } closing a ${...}; returns when ${ or ` found
    const s = i;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') line++;
      if (c === '`') { i++; push('tpl', src.slice(s, i), s); return; }
      if (c === '$' && src[i + 1] === '{') { i += 2; push('tpl', src.slice(s, i), s); stack.push('T'); return; }
      i++;
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\uFEFF') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; for (let k = i; k < end; k++) if (src[k] === '\n') line++; i = end; continue; }
    if (c === '"' || c === "'") { const s = i; i++; while (i < n && src[i] !== c) { if (src[i] === '\\') i++; else if (src[i] === '\n') line++; i++; } i++; push('str', src.slice(s, i), s); continue; }
    if (c === '`') { i++; scanTemplate(); continue; }
    if (/[A-Za-z_$]/.test(c)) { const s = i; while (i < n && /[\w$]/.test(src[i])) i++; push('id', src.slice(s, i), s); continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) { const s = i; while (i < n && /[\w.]/.test(src[i])) i++; push('num', src.slice(s, i), s); continue; }
    if (c === '/' && regexAllowed()) {
      const s = i; i++; let cls = false;
      while (i < n) { const d = src[i]; if (d === '\\') { i += 2; continue; } if (d === '\n') break; if (cls) { if (d === ']') cls = false; } else if (d === '[') cls = true; else if (d === '/') break; i++; }
      i++; while (i < n && /[a-z]/.test(src[i])) i++; push('re', src.slice(s, i), s); continue;
    }
    if (c === '{') { stack.push('{'); push('p', '{', i); i++; continue; }
    if (c === '}') { const top = stack.pop(); if (top === 'T') { i++; scanTemplate(); continue; } push('p', '}', i); i++; continue; }
    // multi-char punctuators that matter: => ?. ...
    if (c === '=' && src[i + 1] === '>') { push('p', '=>', i); i += 2; continue; }
    if (c === '?' && src[i + 1] === '.' && !/[0-9]/.test(src[i + 2])) { push('p', '.', i); i += 2; continue; }   // ?. counts as a member access
    if (c === '.' && src[i + 1] === '.' && src[i + 2] === '.') { push('p', '...', i); i += 3; continue; }
    push('p', c, i); i++;
  }
  return toks;
}

// ---------- structure: matching brackets, functions, jobs ----------
function analyse(src) {
  const T = lex(src), N = T.length;
  const match = new Int32Array(N).fill(-1);
  { const st = []; for (let k = 0; k < N; k++) { const v = T[k].t === 'p' ? T[k].v : ''; if (v === '(' || v === '[' || v === '{') st.push(k); else if (v === ')' || v === ']' || v === '}') { const o = st.pop(); if (o !== undefined) { match[o] = k; match[k] = o; } } } }
  const isP = (k, v) => k >= 0 && k < N && T[k].t === 'p' && T[k].v === v;
  const isId = (k, v) => k >= 0 && k < N && T[k].t === 'id' && (v === undefined || T[k].v === v);
  // body of a function starting at token k (the `function` keyword / the params / the async) -> [open brace, close brace] or [first, last] for an expression arrow
  const arrowBody = (k) => {                           // k = index of '=>'
    const b = k + 1;
    if (isP(b, '{')) return [b, match[b]];
    let d = 0, j = b;                                   // expression body: up to , ; ) ] } at depth 0
    for (; j < N; j++) { const v = T[j].t === 'p' ? T[j].v : ''; if (v === '(' || v === '[' || v === '{') d++; else if (v === ')' || v === ']' || v === '}') { if (d === 0) break; d--; } else if ((v === ',' || v === ';') && d === 0) break; }
    return [b, j - 1];
  };
  const funcAt = (k) => {                              // k at 'async' | 'function' | '(' | id (single-param arrow) -> { body:[a,b], async } or null
    let async = false;
    if (isId(k, 'async')) { async = true; k++; }
    if (isId(k, 'function')) { let j = k + 1; if (isP(j, '*')) j++; if (isId(j)) j++; if (!isP(j, '(')) return null; const c = match[j]; if (!isP(c + 1, '{')) return null; return { body: [c + 1, match[c + 1]], async, start: k }; }
    if (isP(k, '(')) { const c = match[k]; if (c > 0 && isP(c + 1, '=>')) return { body: arrowBody(c + 1), async, start: k }; return null; }
    if (isId(k) && isP(k + 1, '=>')) return { body: arrowBody(k + 1), async, start: k };
    return null;
  };
  const fns = {};                                      // name -> [{ body, async, line, cacheMs }]
  // a self-cached function: "if (now() - X.at < N) return ..." among its first statements -> it does its host work at most every N ms
  const cacheOf = (body) => {
    const a = body[0], b = Math.min(body[1], body[0] + 80);
    for (let k = a; k < b; k++) {
      if (!isId(k, 'if') || !isP(k + 1, '(')) continue;
      const c = match[k + 1]; if (c < 0 || c > body[1] || !isId(c + 1, 'return')) continue;
      const txt = T.slice(k + 2, c).map(t => t.v).join(' ');
      const m = /^(?:Date \. )?now \( \) - [\w$ .]+ < ([\w$ .*]+)$/.exec(txt);
      if (m) { const lim = m[1].trim().split(' ').pop(); return /^\d+$/.test(lim) ? Number(lim) : (constNumLazy(lim) || 1000); }
    }
    return 0;
  };
  let constNumLazy = () => null;
  const addFn = (name, f, at) => { (fns[name] = fns[name] || []).push({ name, body: f.body, async: f.async, line: T[f.start].line, cacheMs: 0, at, scope: null }); };
  for (let k = 0; k < N; k++) {
    if (isId(k, 'function') && isId(k + 1) && isP(k + 2, '(')) { const f = funcAt(isId(k - 1, 'async') ? k - 1 : k); if (f) addFn(T[k + 1].v, f, k); }
    else if ((isId(k, 'const') || isId(k, 'let') || isId(k, 'var')) && isId(k + 1) && isP(k + 2, '=')) { const f = funcAt(k + 3); if (f) addFn(T[k + 1].v, f, k); }
  }
  // jobs: setInterval( fn , period )
  const constNum = (name) => {                         // resolve NAME: <num> / NAME = <num> (first hit)
    for (let k = 0; k < N - 2; k++) if (isId(k, name) && (isP(k + 1, ':') || isP(k + 1, '=')) && T[k + 2].t === 'num' && !isP(k + 3, '.') && !isP(k + 3, '*')) return Number(T[k + 2].v.replace(/_/g, ''));
    return null;
  };
  constNumLazy = constNum;
  Object.keys(fns).forEach(nm => fns[nm].forEach(f => { f.cacheMs = cacheOf(f.body); }));
  const fnRanges = Object.keys(fns).flatMap(nm => fns[nm].map(f => ({ nm, a: f.body[0], b: f.body[1] })));
  const enclosingR = (k) => { let best = null; fnRanges.forEach(r => { if (r.a < k && k < r.b && (!best || r.b - r.a < best.b - best.a)) best = r; }); return best; };
  const enclosing = (k) => { const r = enclosingR(k); return r ? r.nm : null; };
  Object.keys(fns).forEach(nm => fns[nm].forEach(f => { const r = enclosingR(f.at); f.scope = r ? [r.a, r.b] : null; }));
  // a call of NAME at token k -> the definition in the innermost function that also contains k, else a top-level one, else null
  const resolve = (name, k) => {
    const list = fns[name]; if (!list) return null;
    let best = null;
    list.forEach(d => { if (d.scope && d.scope[0] < k && k < d.scope[1] && (!best || !best.scope || d.scope[1] - d.scope[0] < best.scope[1] - best.scope[0])) best = d; });
    if (best) return best;
    return list.find(d => !d.scope) || null;
  };
  const jobs = [];
  for (let k = 0; k < N; k++) {
    if (!isId(k, 'setInterval') || !isP(k + 1, '(') || isP(k - 1, '.')) continue;
    const open = k + 1, close = match[open];
    let comma = -1; { let d = 0; for (let j = open + 1; j < close; j++) { const v = T[j].t === 'p' ? T[j].v : ''; if (v === '(' || v === '[' || v === '{') d++; else if (v === ')' || v === ']' || v === '}') d--; else if (v === ',' && d === 0) { comma = j; } } }
    if (comma < 0) continue;
    // the LAST top-level comma separates the period (setInterval(fn, ms)); extra args are rare -> take the first top-level comma instead
    { let d = 0; for (let j = open + 1; j < close; j++) { const v = T[j].t === 'p' ? T[j].v : ''; if (v === '(' || v === '[' || v === '{') d++; else if (v === ')' || v === ']' || v === '}') d--; else if (v === ',' && d === 0) { comma = j; break; } } }
    let pEnd = close; { let d = 0; for (let j = comma + 1; j < close; j++) { const v = T[j].t === 'p' ? T[j].v : ''; if (v === '(' || v === '[' || v === '{') d++; else if (v === ')' || v === ']' || v === '}') d--; else if (v === ',' && d === 0) { pEnd = j; break; } } }
    const pt = T.slice(comma + 1, pEnd), ptxt = pt.map(t => t.v).join('');
    let ms = null, msGuess = false;
    if (pt.length === 1 && pt[0].t === 'num') ms = Number(pt[0].v);
    else if (pt.length && pt[pt.length - 1].t === 'id') { ms = constNum(pt[pt.length - 1].v); }
    else { try { if (/^[\d*+\-() ]+$/.test(ptxt)) ms = Function('return (' + ptxt + ')')(); } catch (e) { } }
    if (!ms) { ms = 1000; msGuess = true; }
    let body = null, async = false, named = null;
    const f = funcAt(open + 1);
    if (f) { body = f.body; async = f.async; }
    else if (isId(open + 1) && isP(open + 2, ',') && resolve(T[open + 1].v, k)) { const d = resolve(T[open + 1].v, k); named = d.name; body = d.body; async = d.async; }
    if (!body) continue;
    const srcTxt = src.slice(T[open + 1].s, T[comma - 1].s + T[comma - 1].v.length);
    // guard: the first "if (...) return" among the first tokens of the body (tells when the job does nothing)
    let guard = '';
    { const b0 = body[0] + (isP(body[0], '{') ? 1 : 0); for (let q = b0; q < Math.min(body[1], b0 + 12); q++) { if (isId(q, 'if') && isP(q + 1, '(') && isId(match[q + 1] + 1, 'return')) { guard = src.slice(T[q + 2].s, T[match[q + 1]].s).replace(/\s+/g, ' '); break; } } }
    jobs.push({ guard, line: T[k].line, ms, msGuess, period: ptxt, body, async, named, inside: enclosing(k), snippet: (named ? srcTxt : srcTxt).replace(/\s+/g, ' ').slice(0, 40) });
  }
  return { T, N, match, fns, jobs, isP, isId, resolve };
}

// ---------- counting ----------
function makeCounter(A) {
  const { T, match, fns, isP, isId, resolve } = A;
  const KINDS = ['iter', 'lookup', 'me', 'target', 'options', 'flags', 'field', 'ref', 'byid', 'api', 'snap', 'copy'];
  const zero = () => { const o = { touch: 0, fresh: 0 }; KINDS.forEach(k => { o[k] = 0; }); return o; };
  const add = (a, b, f) => { Object.keys(b).forEach(k => { a[k] += b[k] * f; }); };
  const direct = new Map();                           // "a:b" -> { c, calls: [{name, f}] }
  // receiver of `.forEach(` at index dot-1: a host collection name, a snapshot call, or generic
  const receiverAt = (k) => {                         // k = token before the '.'
    if (isId(k) && SIZE[T[k].v] !== undefined && !isP(k - 1, '.')) return { host: T[k].v, n: SIZE[T[k].v] };
    if (isP(k, ')')) {
      const o = match[k];
      if (isId(o - 1) && SNAPSIZE[T[o - 1].v] !== undefined) return { snap: true, n: SNAPSIZE[T[o - 1].v] };
      if (isId(o - 1) && isP(o - 2, '.') && isId(o - 3, 'hostSnap') && HOSTSNAPSIZE[T[o - 1].v] !== undefined) return { snap: true, n: HOSTSNAPSIZE[T[o - 1].v] };
    }
    return { n: GENERIC };
  };
  const scan = (a, b) => {
    const key = a + ':' + b; if (direct.has(key)) return direct.get(key);
    const c = zero(), calls = [];
    const fac = [];                                   // stack of { close, f, param }
    let pendingLoop = 0, pendingIf = 0;
    const iterArrows = new Set();                     // '=>' of a loop callback (already counted x the loop size)
    const exprEnd = (b0) => { let d = 0, j = b0; for (; j <= b; j++) { const v = T[j].t === 'p' ? T[j].v : ''; if (v === '(' || v === '[' || v === '{') d++; else if (v === ')' || v === ']' || v === '}') { if (d === 0) break; d--; } else if ((v === ',' || v === ';') && d === 0) break; } return j - 1; };
    const F = () => fac.reduce((x, s) => x * s.f, 1);
    const hostParams = () => fac.filter(s => s.param).map(s => s.param);
    for (let k = a; k <= b; k++) {
      while (fac.length && k > fac[fac.length - 1].close) fac.pop();
      const t = T[k], f = F();
      if (t.t === 'id') {
        const v = t.v, prevDot = isP(k - 1, '.'), nextDot = isP(k + 1, '.'), call = isP(k + 1, '(');
        if (v === 'function' && k > a) {             // a nested function: named -> counted where called (0), anonymous -> x0.25
          let j = k + 1; if (isP(j, '*')) j++; const named = isId(j); if (named) j++;
          if (isP(j, '(') && isP(match[j] + 1, '{')) { const e = match[match[j] + 1], iife = isP(e + 1, ')') && isP(e + 2, '('); fac.push({ close: e, f: iife ? 1 : named ? 0 : 0.25 }); }
          continue;
        }
        if (v === 'for' || v === 'while') { pendingLoop = 1; continue; }
        if (v === 'if') { pendingIf = 1; continue; }
        if (v === 'else' && isP(k + 1, '{')) { fac.push({ close: match[k + 1], f: 0.5 }); continue; }
        if (v === 'catch') { const o = isP(k + 1, '(') ? match[k + 1] + 1 : k + 1; if (isP(o, '{')) fac.push({ close: match[o], f: 0 }); continue; }   // error path: not counted
        if (prevDot) {
          if (ITER.has(v) && call) {                    // collection loop
            const r = receiverAt(k - 2), o = k + 1;
            let param = null;
            if (isId(o + 1) && isP(o + 2, '=>')) { param = T[o + 1].v; iterArrows.add(o + 2); }
            else if (isP(o + 1, '(') && isId(o + 2)) { param = T[o + 2].v; if (isP(match[o + 1] + 1, '=>')) iterArrows.add(match[o + 1] + 1); }
            else if (isId(o + 1, 'async') && isId(o + 2) && isP(o + 3, '=>')) iterArrows.add(o + 3);
            if (r.host) {
              c.iter += r.n * f; c.touch += (r.n + 1) * f;
              if (COPY_GETTERS.has(r.host)) { c.copy += f; c.fresh += (1 + SIZE.CreaturesList / 10) * f; }
              if (v !== 'forEach') { c.copy += f; c.fresh += f; }   // a host .filter()/.find() builds a copy collection
              fac.push({ close: match[o], f: r.n, param });
            } else {
              if (r.snap) { /* snapshot array: plain JS */ }
              fac.push({ close: match[o], f: r.n });
            }
            continue;
          }
          if (LOOKUP.has(v) && call) { const r = receiverAt(k - 2); if (r.host) { c.lookup += f; c.touch += f; } continue; }
          if (v === 'ref') { c.ref += f; c.touch += f; continue; }
          // a field read on a host loop variable
          const owner = isId(k - 2) ? T[k - 2].v : null;
          if (owner && hostParams().includes(owner) && !isP(k - 3, '.')) { c.field += f; c.touch += f; if (FRESH_FIELDS.has(v)) c.fresh += f; continue; }
          continue;
        }
        if (v === 'Me' && nextDot && isId(k + 2)) { c.me += f; c.touch += f; if (FRESH_FIELDS.has(T[k + 2].v)) c.fresh += f; k += 2; continue; }
        if (v === 'Target' && !isP(k + 1, ':')) { c.target += f; c.touch += f; if (nextDot && isId(k + 2)) { c.touch += f; if (FRESH_FIELDS.has(T[k + 2].v)) c.fresh += f; k += 2; } continue; }
        if (v === 'Options' && nextDot) { c.options += f; c.touch += f; k += 2; continue; }
        if (GLOBAL_GETTERS.has(v) && !isP(k + 1, ':') && !isP(k + 1, '=')) { c.flags += f; c.touch += f; continue; }
        if (GLOBAL_FUNCS.has(v) && call) { c.api += f; c.touch += f; continue; }
        if (API_OBJ.has(v) && nextDot) { c.api += f; c.touch += f; k += 2; continue; }
        if (COPY_GETTERS.has(v) && !nextDot) { c.copy += f; c.touch += f; c.fresh += f; continue; }
        if ((v === 'mobById' || v === 'npcById' || v === 'charById') && call) { c.byid += f; c.touch += f; continue; }
        if (SNAPSIZE[v] !== undefined && call) { c.snap += f / 8; c.touch += f / 8; continue; }        // <= 1 host call per 250 ms, shared
        if (v === 'meSnap' && call) { c.snap += f / 8; c.touch += f / 8; continue; }
        if (v === 'hostSnap' && nextDot) { c.snap += f / 4; c.touch += f / 4; k += 2; continue; }
        if (v === 'new' && isId(k + 1, 'Point3D')) { c.fresh += f; c.touch += f; continue; }
        if (call && fns[v]) { const d = resolve(v, k); if (d && d.body[0] !== a) calls.push({ name: v, def: d, f }); }
        continue;
      }
      if (t.t === 'p' && t.v === '=>' && !iterArrows.has(k)) {
        // a nested closure: a named one (const x = (..) =>) is counted where it is CALLED -> 0 here; an anonymous one (a callback handed
        // to a timer / promise / App.on / another function) runs later or not at all -> x0.25
        let ps = isP(k - 1, ')') ? match[k - 1] : k - 1; if (isId(ps - 1, 'async')) ps--;
        const named = isP(ps - 1, '=') && isId(ps - 2) && (isId(ps - 3, 'const') || isId(ps - 3, 'let') || isId(ps - 3, 'var'));
        const end = isP(k + 1, '{') ? match[k + 1] : exprEnd(k + 1);
        const iife = isP(end + 1, ')') && isP(end + 2, '(');     // (() => { ... })() runs right here
        fac.push({ close: end, f: iife ? 1 : named ? 0 : 0.25 });
        continue;
      }
      if (t.t === 'p') {
        if (t.v === '(' && (pendingLoop || pendingIf)) {
          const c2 = match[k];
          if (isP(c2 + 1, '{')) {
            let lf = 0.5;
            if (pendingLoop) { lf = GENERIC; for (let q = c2 + 1; q < match[c2 + 1]; q++) if (isId(q, 'await')) { lf = 1; break; } }   // a paced loop (await inside): ~1 pass per run
            fac.push({ close: match[c2 + 1], f: lf });
          }
          pendingLoop = 0; pendingIf = 0;
          continue;
        }
      }
    }
    const r = { c, calls };
    direct.set(key, r);
    return r;
  };
  const memo = new Map();
  // total(def) = { per: counts per call, once: { defName@line: counts } } — a self-cached callee ("if (now() - X.at < N) return") does its
  // work at most once per N ms however often it is called: it goes to "once" (counted once per job run x min(1, 1000/N)), never x loops.
  const total = (def, depth, seen) => {
    if (!def || def.async) return { per: zero(), once: {} };   // an async flow runs at its own pace (sleeps/awaits)
    const mk = depth + ':' + def.line + ':' + def.body[0];  // memo per depth (the depth cap) and only for results without a cycle cut
    if (memo.has(mk)) return memo.get(mk);
    if (seen.has(def)) return { per: zero(), once: {}, cut: true };
    if (depth > 4) return { per: zero(), once: {} };
    seen.add(def);
    const r = scan(def.body[0], def.body[1]), per = zero(), once = {};
    let cut = false;
    add(per, r.c, 1);
    r.calls.forEach(cl => {
      const t = total(cl.def, depth + 1, seen);
      if (t.cut) cut = true;
      Object.assign(once, t.once);
      if (cl.def.cacheMs) { const o = zero(); add(o, t.per, Math.min(1, 1000 / cl.def.cacheMs)); once[cl.def.name + '@' + cl.def.line] = o; }
      else add(per, t.per, cl.f);
    });
    seen.delete(def);
    const out = { per, once, cut };
    if (!cut) memo.set(mk, out);
    return out;
  };
  const flat = (t) => { const o = zero(); add(o, t.per, 1); Object.keys(t.once).forEach(k => add(o, t.once[k], 1)); return o; };
  const job = (j) => {
    const r = scan(j.body[0], j.body[1]);
    const per = zero(); add(per, r.c, 1);
    const once = {}, callees = {};
    const seen = new Set();
    r.calls.forEach(cl => {
      const t = total(cl.def, 1, seen);
      Object.keys(t.once).forEach(k => { once[k] = t.once[k]; });
      let c;
      if (cl.def.cacheMs) { c = zero(); add(c, t.per, Math.min(1, 1000 / cl.def.cacheMs)); once[cl.def.name + '@' + cl.def.line] = c; }
      else { c = zero(); add(c, t.per, cl.f); add(per, c, 1); }
      callees[cl.name] = (callees[cl.name] || 0) + c.touch + Object.keys(t.once).reduce((s2, k) => s2 + t.once[k].touch, 0);
    });
    const out = flat({ per, once });
    return { direct: r.c, total: out, callees };
  };
  return { job, total: (d) => flat(total(d, 0, new Set())), scan, KINDS };
}

// ---------- measured profile (optional): Logs/sched_top.log rows "ms  runs x every P ms  L<line> <snippet>" ----------
function measured() {
  const f = path.join(ROOT, 'Logs', 'sched_top.log'), by = {};
  try {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).slice(-4000);
    let secs = 0;
    lines.forEach(l => {
      const h = /\] (\d+)s: ticks/.exec(l); if (h) { secs = Number(h[1]); return; }
      const m = /^\s*\d+\.\s+(\d+) ms\s+(\d+)x every (\d+) ms\s+L\d+ (.*)$/.exec(l);
      if (m && secs) { const k = m[4].trim(), r = by[k] || (by[k] = { ms: 0, runs: 0, secs: 0 }); r.ms += Number(m[1]); r.runs += Number(m[2]); r.secs += secs; }
    });
  } catch (e) { }
  return by;
}

function main() {
  const src = fs.readFileSync(SRC, 'utf8');
  const A = analyse(src), C = makeCounter(A), M = measured();
  const rows = A.jobs.map((j, idx) => {
    const r = C.job(j), perMin = 60000 / j.ms;
    const top = Object.keys(r.callees).sort((a, b) => r.callees[b] - r.callees[a]).filter(n => r.callees[n] >= 1).slice(0, 4).map(n => `${n} ${Math.round(r.callees[n])}`);
    const kinds = C.KINDS.filter(k => r.total[k] >= 0.5).sort((a, b) => r.total[b] - r.total[a]).slice(0, 4).map(k => `${k} ${Math.round(r.total[k])}`);
    const meas = M[j.snippet.trim()] || null;
    return { idx, line: j.line, ms: j.ms, msGuess: j.msGuess, period: j.period, inside: j.inside, async: j.async, snippet: j.snippet,
      perRun: r.total.touch, direct: r.direct.touch, fresh: r.total.fresh, perMin: r.total.touch * perMin, freshPerMin: r.total.fresh * perMin,
      kinds, top, guard: j.guard, measuredMsPerRun: meas && meas.runs ? +(meas.ms / meas.runs).toFixed(1) : null };
  }).sort((a, b) => b.perMin - a.perMin);
  if (asJson) { process.stdout.write(JSON.stringify(rows.map(r => ({ idx: r.idx, inside: r.inside, line: r.line, ms: r.ms, snippet: r.snippet, perRun: Math.round(r.perRun), perMin: Math.round(r.perMin), freshPerMin: Math.round(r.freshPerMin) })), null, 1)); return; }
  const glob = rows.filter(r => !r.inside), tot = glob.reduce((s, r) => s + r.perMin, 0), totF = glob.reduce((s, r) => s + r.freshPerMin, 0);
  const fmt = (x) => x >= 100 ? String(Math.round(x)) : x >= 10 ? x.toFixed(0) : x.toFixed(1);
  const L = [];
  L.push('# Host touch audit (static estimate)', '');
  L.push(`Generated ${new Date().toISOString()} by \`node docs/plan/tools/host_touch_audit.js\` from \`${path.relative(ROOT, SRC).replace(/\\/g, '/')}\` (${A.jobs.length} timer jobs, ${Object.keys(A.fns).length} named functions). Do not edit by hand.`, '');
  L.push('**What is counted** (per job run, following calls into functions of the file; see the header of the tool for the model):',
    '- *touch* = one JS -> .NET bridge call: a host property read (Me.X, Options.Y, an entity field inside a host loop), a collection item, a lookup, a global getter (Target, IsInCombat), an API call (Send/File/App, Select, ...).',
    '- *fresh* = touches that marshal a NEW .NET object every time (MobsList/NpcList/CharList copies, host .filter(), boxed enums/structs: crtType, Point3D, item Type/Grade, `new Point3D`). ClearScript reuses the proxy of an object it already wraps (hostObjectHostItemCache), so *fresh* is what always adds a HostItem; other touches add one only for an object not wrapped yet (a new creature, a re-created entity).',
    '- loops multiply (host collection: its estimated size, JS loop x4), a block under if/else counts x0.5, a nested anonymous callback x0.25 (a named one counts where it is called), a catch block 0, a self-cached function (`if (now() - X < N) return`) once per run x min(1, 1000/N), async callees are not followed (they run at their own pace). It is an upper-bound-ish estimate for ranking, not a measurement.', '');
  L.push(`**Always-on jobs (registered at load): ~${Math.round(tot).toLocaleString('en')} touches/min, ~${Math.round(totF).toLocaleString('en')} fresh/min per window** (estimate; 59 windows run the script).`, '');
  L.push(`HOSTTOUCH patch (2026-10-12: PartyList / Inventory walks -> JSON rows via partyRows / invRows, nnFight Target once + .ref only for the winner; test \`docs/plan/tools/test_hosttouch.js\`): **${src.includes('HOSTTOUCH-ROWS-BEGIN') ? 'applied' : 'NOT applied'}** in this file. Its static effect when measured on a copy: always-on jobs 410,027 -> 340,061 touches/min per window (-17 %; the biggest single drop, the leader escape-scroll watch, only runs outside lead mode).`, '');
  L.push('| # | Job (line) | Period | Touches/run | Touches/min | Fresh/min | Main kinds | Biggest callees (touches/run) | Idle when (its first guard) | Measured ms/run |', '|---|---|---|---|---|---|---|---|---|---|');
  rows.slice(0, 40).forEach((r, i) => L.push(`| ${i + 1} | L${r.line} \`${r.snippet.replace(/\|/g, '\\|').replace(/`/g, "'")}\`${r.inside ? ` (inside ${r.inside})` : ''}${r.async ? ' async' : ''} | ${r.ms} ms${r.msGuess ? ' (?' + r.period.replace(/\|/g, '\\|') + ')' : ''} | ${fmt(r.perRun)} (direct ${fmt(r.direct)}) | ${fmt(r.perMin)} | ${fmt(r.freshPerMin)} | ${r.kinds.join(', ')} | ${r.top.join(', ')} | ${r.guard ? '`' + r.guard.slice(0, 70).replace(/\|/g, '\\|').replace(/`/g, "'") + '`' : ''} | ${r.measuredMsPerRun === null ? '' : r.measuredMsPerRun} |`));
  L.push('', '## Kinds', '', 'iter = host collection items in a loop, field = field reads on such an item, lookup = GetItemByID/ObjectID, me = Me.<field>, target = Target, options = Options.<x>, flags = IsInCombat/IsEnabled/..., api = Send/File/App/Select/..., ref = snapshot entry `.ref` (live object lookup), byid = mobById/npcById/charById, snap = snapshot helper calls (cheap), copy = copy collections.', '');
  L.push('## Rest of the jobs', '', '| Job (line) | Period | Touches/min |', '|---|---|---|');
  rows.slice(40).forEach(r => L.push(`| L${r.line} \`${r.snippet.replace(/\|/g, '\\|').replace(/`/g, "'")}\`${r.inside ? ` (inside ${r.inside})` : ''} | ${r.ms} ms | ${fmt(r.perMin)} |`));
  fs.writeFileSync(OUT, L.join('\n') + '\n');
  console.log(`host_touch_audit: ${A.jobs.length} jobs, always-on ~${Math.round(tot)} touches/min (${Math.round(totF)} fresh/min) -> ${path.relative(ROOT, OUT)}`);
  rows.slice(0, 12).forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. L${r.line} ${r.ms}ms perRun ${fmt(r.perRun)} perMin ${fmt(r.perMin)} fresh/min ${fmt(r.freshPerMin)} | ${r.kinds.join(', ')} | ${r.top.join(', ')} | ${r.snippet}`));
}
if (require.main === module) main();
module.exports = { lex, analyse, makeCounter };
