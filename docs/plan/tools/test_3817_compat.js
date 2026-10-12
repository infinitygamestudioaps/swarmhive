// OFFLINE TEST of the L2Swarm 3.8.17 movement compatibility of swarm.js (2026-10-12, patches/upstream_report_3.8.17_2026-10-12.md §4).
//   node docs/plan/tools/test_3817_compat.js [swarm.js] [baseline swarm.js]     (default Scripts_dev/swarm.js; exit code 1 when a check fails)
// The optional baseline (an UNPATCHED swarm.js) is run through the same simulations for comparison only (never fails the test).
// 1) STATIC: every GoToPoint(...) call in code (comments / strings / regex blanked) handles its rejection (.catch, .then(ok, fail), or a
//    variable that gets one), every MoveToPoint(...) passes a fail callback, no `await GoToPoint`.
// 2) MOVEOWN-PURE unit tests: generations, newer / busy / expiry, navStopOp ownership, the MoveToPoint wrapper (3.8.17 handle, 3.8.14 none,
//    read-only global, double wrap), navGoPromise result mapping.
// 3) SIMULATION: the real walkDirect / walkDirectRun / navHop / standUp + MOVEOWN blocks of the file run in a vm on a fake clock against a
//    simulated L2Swarm in two modes: "3.8.17" (MoveToPoint returns a handle, a new movement cancels the old one with "Script movement
//    cancelled.", GoToPoint rejects on timeout (cancelling the walk) / death) and "3.8.14" (no handle, no cancel, the walk goes on after the
//    timeout). Scenarios: long walk in hops, two overlapping walks, death, slow walk (timeout while moving), wall (stuck), user move vs walk,
//    straight walk after a native walk.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const FILE = process.argv.slice(2).filter(a => !/^--/.test(a))[0] || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const BASE = process.argv.slice(2).filter(a => !/^--/.test(a))[1] || '';
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const info = (what) => console.log('info ' + what);
const src = fs.readFileSync(FILE, 'utf8');
console.log('file: ' + FILE);

// ---- lexer: blank comments, strings, template literals and regex literals (same length, newlines kept) ----------------------------
function blank(s) {
  const out = s.split('');
  const put = (i, j) => { for (let k = i; k < j; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
  let i = 0, last = '';                          // last significant code char (for the regex-vs-division decision)
  const isId = (c) => /[A-Za-z0-9_$]/.test(c);
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { const j = s.indexOf('\n', i); const e = j < 0 ? s.length : j; put(i, e); i = e; continue; }
    if (c === '/' && d === '*') { const j = s.indexOf('*/', i + 2); const e = j < 0 ? s.length : j + 2; put(i, e); i = e; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < s.length && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') j++; j++; } put(i + 1, j); i = j + 1; last = 'a'; continue; }
    if (c === '`') { let j = i + 1, depth = 0; while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (!depth && s[j] === '`') break; if (s[j] === '$' && s[j + 1] === '{') { depth++; j += 2; continue; } if (depth && s[j] === '}') { depth--; j++; continue; } j++; } put(i + 1, j); i = j + 1; last = 'a'; continue; }
    if (c === '/') {
      // regex literal when the previous significant char cannot end an expression (or a keyword like return / typeof precedes)
      const before = s.slice(Math.max(0, i - 12), i);
      const kw = /(?:^|[^A-Za-z0-9_$])(return|typeof|case|in|of|delete|void|throw|new)\s*$/.test(before);
      if (!last || '(,=:[!&|?{};+-*%<>~^'.indexOf(last) >= 0 || kw) {
        let j = i + 1, cls = false;
        while (j < s.length && s[j] !== '\n') { if (s[j] === '\\') { j += 2; continue; } if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false; else if (s[j] === '/' && !cls) break; j++; }
        put(i + 1, j); j++; while (j < s.length && /[a-z]/.test(s[j])) j++; i = j; last = 'a'; continue;
      }
    }
    if (!/\s/.test(c)) last = isId(c) ? 'a' : c;
    i++;
  }
  return out.join('');
}
const code = blank(src);
const lineOf = (i) => src.slice(0, i).split('\n').length;
/** the arguments (text slices) of the call whose '(' is at index p in `code` */
function callArgs(p) {
  let depth = 0, start = p + 1; const args = [];
  for (let j = p; j < code.length; j++) {
    const c = code[j];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) { if (src.slice(start, j).trim()) args.push(src.slice(start, j).trim()); return { args, end: j }; } }
    else if (c === ',' && depth === 1) { args.push(src.slice(start, j).trim()); start = j + 1; }
  }
  return { args, end: code.length };
}
/** .then(a, b) / .catch(x) directly chained after index e (the call's closing paren) */
function handledChain(e) {
  const rest = code.slice(e + 1, e + 400);
  const m = /^\s*\.(then|catch)\s*\(/.exec(rest);
  if (!m) return false;
  if (m[1] === 'catch') return true;
  const p = e + 1 + m[0].length - 1;
  return callArgs(p).args.length >= 2 || handledChain(callArgs(p).end);
}

// ---- 1) STATIC ----------------------------------------------------------------------------------------------------------------
{
  const sites = [];
  const re = /\bGoToPoint\s*\(/g; let m;
  while ((m = re.exec(code))) {
    const i = m.index; const pre = code.slice(Math.max(0, i - 40), i);
    if (/function\s+$/.test(pre)) continue;           // a definition, not a call
    const p = i + m[0].length - 1;
    const { end } = callArgs(p);
    let ok = handledChain(end), how = ok ? 'chained' : '';
    const v = /([A-Za-z_$][\w$]*)\s*=\s*$/.exec(pre);
    if (!ok && v) { const after = code.slice(end, end + 500); const r2 = new RegExp('\\b' + v[1].replace('$', '\\$') + '\\s*\\.(then|catch)\\s*\\(', 'g'); let q; while ((q = r2.exec(after))) { const pp = end + q.index + q[0].length - 1; if (q[1] === 'catch' || callArgs(pp).args.length >= 2) { ok = true; how = 'via ' + v[1]; break; } } }
    if (/await\s+$/.test(pre)) { ok = false; how = 'await GoToPoint'; }
    sites.push({ line: lineOf(i), ok, how });
  }
  sites.forEach(x => check(x.ok, `GoToPoint call at line ${x.line} handles its rejection (${x.how || 'NOT HANDLED'})`));
  info(`${sites.length} GoToPoint call site(s) in code`);
  const re2 = /\bMoveToPoint\s*\(/g; let n = 0;
  while ((m = re2.exec(code))) {
    const i = m.index; const pre = code.slice(Math.max(0, i - 40), i);
    if (/function\s+$/.test(pre)) continue;
    const { args } = callArgs(i + m[0].length - 1);
    const objForm = /^new\s+Point3?D\b|^\{/.test(args[0] || '');
    const need = objForm ? 3 : 4;
    const last = args[args.length - 1] || '';
    const ok = args.length >= need && /=>|function\b|^[A-Za-z_$][\w$]*$/.test(last);
    check(ok, `MoveToPoint call at line ${lineOf(i)} passes a fail callback (${args.length} args)`);
    n++;
  }
  info(`${n} MoveToPoint call site(s) in code`);
  check(!/\bawait\s+GoToPoint\b/.test(code), 'no `await GoToPoint(...)` (a rejection would throw into the caller)');
  check(code.indexOf('MOVEOWN') < 0 && src.indexOf('// MOVEOWN-PURE-BEGIN') >= 0 && src.indexOf('// MOVEOWN-HOST-END') >= 0, 'MOVEOWN-PURE + MOVEOWN-HOST blocks present');
}

// ---- 2) MOVEOWN-PURE unit tests -----------------------------------------------------------------------------------------------
const pa = src.indexOf('// MOVEOWN-PURE-BEGIN'), pb = src.indexOf('// MOVEOWN-PURE-END');
const ha = src.indexOf('// MOVEOWN-HOST-BEGIN'), hb = src.indexOf('// MOVEOWN-HOST-END');
if (pa < 0 || pb < pa || ha < 0 || hb < ha) { console.error('MOVEOWN blocks not found'); console.log(`\n${fails + 1} check(s) FAILED`); process.exit(1); }
const PURE = src.slice(pa, pb), HOST = src.slice(ha, hb);
const P = new Function(PURE + '\nreturn { MOVE, moveBegin, moveEnd, moveLive, moveNewer, moveBusy, movePrune, navCancelled, navTimedOut, navWrapMoveToPoint, navStopOp, navGoPromise };')();
(async () => {
  {
    const M = { gen: 0, active: {}, op: null, opGen: 0, issuing: 0, wrapped: false, ops: 0 };
    const a = P.moveBegin(M, 'walk', 10000, 1000), b = P.moveBegin(M, 'nudge', 2000, 1500);
    check(b > a, 'generations grow');
    check(P.moveNewer(M, a, 2000) === 'nudge' && P.moveNewer(M, b, 2000) === '', 'the older walk sees the newer one; the newest sees none');
    check(P.moveNewer(M, a, 1500 + 2000 + 5001) === '', 'a newer walk that outlived its timeout + 5 s no longer blocks (no stuck pause)');
    P.moveEnd(M, b);
    check(P.moveNewer(M, a, 2000) === '' && P.moveBusy(M, 2000) && !P.moveBusy(M, 2000, a), 'after moveEnd: no newer; busy = any live walk except the given one');
    P.movePrune(M, 1000 + 10000 + 5001); check(Object.keys(M.active).length === 0, 'movePrune drops expired walks');
  }
  {
    const mkOp = () => ({ stopped: 0, Stop() { this.stopped++; } });
    const M = { gen: 0, active: {}, op: null, opGen: 0, issuing: 0, wrapped: false, ops: 0 };
    const a = P.moveBegin(M, 'a', 60000, 0), b = P.moveBegin(M, 'b', 60000, 0);
    let op = mkOp(); M.op = op; M.opGen = b;
    check(!P.navStopOp(M, a, 10, false) && op.stopped === 0, 'navStopOp: an older walk never stops a NEWER live walk\'s movement');
    check(!P.navStopOp(M, a, 10, true) && op.stopped === 0, 'navStopOp strict: only the own movement');
    check(P.navStopOp(M, b, 10, true) && op.stopped === 1 && M.op === null, 'navStopOp: the own movement is stopped and forgotten');
    op = mkOp(); M.op = op; M.opGen = a;
    check(P.navStopOp(M, b, 10, false) && op.stopped === 1, 'navStopOp: a newer walk stops an OLDER walk\'s movement before its straight move');
    op = mkOp(); M.op = op; M.opGen = 0;
    check(P.navStopOp(M, b, 10, false) && op.stopped === 1, 'navStopOp: an unowned movement (raw GoToPoint / MoveToNpc) is stopped before a straight move');
    op = mkOp(); M.op = op; M.opGen = 0;
    check(!P.navStopOp(M, b, 10, true) && op.stopped === 0, 'navStopOp strict: an unowned movement is left alone (walk end)');
    P.moveEnd(M, b); op = mkOp(); M.op = op; M.opGen = b;
    check(P.navStopOp(M, a, 10, false) && op.stopped === 1, 'navStopOp: the movement of an ENDED walk is stopped');
    M.op = { Stop() { throw new Error('host'); } }; M.opGen = a;
    check(P.navStopOp(M, a, 10, true) === true && M.op === null, 'navStopOp swallows a throwing Stop()');
    check(P.navStopOp({ op: null }, 1, 0, false) === false, 'navStopOp without a handle (3.8.14) = no-op');
  }
  {
    const G17 = { MoveToPoint() { return { Stop() { } }; } }, M17 = { op: null, opGen: 0, issuing: 7, ops: 0 };
    check(P.navWrapMoveToPoint(G17, M17) && M17.wrapped, 'wrapper installed (3.8.17-like)');
    const h = G17.MoveToPoint(1, 2, 3); check(M17.op === h && M17.opGen === 7 && M17.ops === 1, 'wrapper remembers the 3.8.17 handle and its owner (MOVE.issuing)');
    check(P.navWrapMoveToPoint(G17, M17) && G17.MoveToPoint.__swarmMoveOwner && G17.MoveToPoint(1, 2, 3) === M17.op, 'second wrap (script reload in the same engine) is a no-op, not a double wrapper');
    const G14 = { MoveToPoint() { return undefined; } }, M14 = { op: { Stop() { } }, opGen: 3, issuing: 0, ops: 0 };
    P.navWrapMoveToPoint(G14, M14); G14.MoveToPoint(1, 2, 3);
    check(M14.op === null && M14.opGen === 0 && M14.ops === 0, '3.8.14: MoveToPoint returns nothing -> no handle remembered');
    const GR = {}; Object.defineProperty(GR, 'MoveToPoint', { value: function () { }, writable: false });
    const MR = { op: null }; let threw = false; try { P.navWrapMoveToPoint(GR, MR); } catch (e) { threw = true; }
    check(!threw && MR.wrapped === false, 'read-only global MoveToPoint: no throw, wrapped=false (GoToPoint still works, just no handle)');
    check(P.navWrapMoveToPoint({}, {}) === false, 'no MoveToPoint at all: false');
  }
  {
    const M = { issuing: 0 };
    let r = await P.navGoPromise(M, () => Promise.resolve(), 1, 2, 3, 100, 5); check(r.ok && !r.cancelled, 'navGoPromise: resolve -> ok');
    r = await P.navGoPromise(M, () => Promise.reject(new Error('Cannot move to point 1, 2, 3: Script movement cancelled.')), 1, 2, 3, 100, 5);
    check(!r.ok && r.cancelled && !r.timedOut, 'navGoPromise: 3.8.17 supersede rejection -> cancelled (never thrown)');
    r = await P.navGoPromise(M, () => Promise.reject(new Error('GoToPoint timed out after 15000 ms moving to 1, 2, 3; position=0, 0, 0; remaining XY distance=500')), 1, 2, 3, 100, 5);
    check(!r.ok && r.timedOut && !r.cancelled, 'navGoPromise: timeout -> timedOut');
    r = await P.navGoPromise(M, () => Promise.reject(new Error('Cannot move to point: character died.')), 1, 2, 3, 100, 5);
    check(!r.ok && !r.timedOut && !r.cancelled, 'navGoPromise: death -> plain failure');
    r = await P.navGoPromise(M, () => { throw new TypeError('GoToPoint requires valid coordinates.'); }, 1, 2, 3, 100, 5);
    check(!r.ok && r.threw && M.issuing === 0, 'navGoPromise: a synchronous throw -> threw, MOVE.issuing reset');
    let seen = -1; r = await P.navGoPromise(M, () => { seen = M.issuing; return undefined; }, 1, 2, 3, 100, 9);
    check(r.ok && seen === 9 && M.issuing === 0, 'navGoPromise: MOVE.issuing = owner only during the call; a non-promise return counts as ok');
    check(P.navCancelled('Script movement cancelled.') && !P.navCancelled(null) && !P.navCancelled(undefined), 'navCancelled on reason strings / null');
  }

  // ---- 3) SIMULATION --------------------------------------------------------------------------------------------------------
  const sim = await simulateFile(src, true);
  if (BASE) { console.log('\n--- baseline (informational): ' + BASE); await simulateFile(fs.readFileSync(BASE, 'utf8'), false); }
  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

// ================================================================================================================================
function extractFn(s, name) {
  const cs = blank(s);
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(cs); if (!m) return '';
  let i = cs.indexOf('{', m.index), depth = 0;
  for (let j = i; j < cs.length; j++) { if (cs[j] === '{') depth++; else if (cs[j] === '}') { depth--; if (!depth) return s.slice(m.index, j + 1); } }
  return '';
}
function navConfig(s) { const m = /\bnav:\s*(\{[^}]*\})/.exec(s); return m ? Function('return ' + m[1])() : null; }

async function simulateFile(S, strict) {
  const nav = navConfig(S);
  const parts = ['walkDirect', 'walkDirectRun', 'navHop', 'standUp'].map(n => extractFn(S, n)).filter(Boolean);
  const pA = S.indexOf('// MOVEOWN-PURE-BEGIN'), pB = S.indexOf('// MOVEOWN-HOST-END');
  const own = pA >= 0 && pB > pA ? S.slice(pA, pB) : '';
  const T = strict ? check : (ok, what) => info((ok ? '[yes] ' : '[no]  ') + what);
  const res = {};
  for (const mode of [17, 14]) {
    const tag = mode === 17 ? '3.8.17' : '3.8.14';
    // S1 long walk in hops
    let w = await scenario(mode, { parts, own, nav }, async (W, X) => {
      const r = await W.run(X.walkDirect(6000, 0, 0, 150, 120000), 130000);
      return { r, straight: W.log.straight, rej: W.unhandled.length, gotos: W.log.moves };
    });
    T(w.r === true && w.rej === 0, `${tag} long walk 6000 in hops: arrives (${w.r}), no unhandled rejection (${w.rej})`);
    T(w.straight === 0, `${tag} long walk: native hops only, never flipped to straight lines by its own hop re-issue (straight moves: ${w.straight}, native: ${w.gotos})`);
    // S2 two overlapping walks
    w = await scenario(mode, { parts, own, nav }, async (W, X) => {
      const A = X.walkDirect(6000, 0, 11, 150, 120000); let B = null, bEnd = 0, bStart = 0;
      W.at(3000, () => { bStart = W.t; W.markZ = true; W.zDuring = { 11: 0, 77: 0 }; B = X.walkDirect(2500, 2500, 77, 150, 40000); B.then(() => { bEnd = W.t; W.markZ = false; }); });
      const rA = await W.run(A, 160000);
      const rB = B ? await W.run(B, 1000) : null;
      return { rA, rB, aDuringB: W.zDuring ? W.zDuring[11] : -1, bMoves: W.zDuring ? W.zDuring[77] : -1, rej: W.unhandled.length, bMs: bEnd - bStart };
    });
    T(w.rA === true && w.rB === true && w.rej === 0, `${tag} overlapping walks: both arrive (A ${w.rA}, B ${w.rB}), no unhandled rejection (${w.rej})`);
    T(w.aDuringB === 0, `${tag} overlapping walks: the older walk issues NO move while the newer one runs (A moves during B: ${w.aDuringB}, B moves: ${w.bMoves}, B took ${Math.round(w.bMs / 1000)} s)`);
    // S3 death
    if (mode === 17) {
      w = await scenario(mode, { parts, own, nav }, async (W, X) => {
        const A = X.walkDirect(6000, 0, 0, 150, 120000); W.at(4000, () => { W.me.IsDead = true; });
        let threw = false, r = null; try { r = await W.run(A, 20000); } catch (e) { threw = true; }
        return { r, threw, rej: W.unhandled.length, live: !!(W.op && W.op.alive) };
      });
      T(w.r === false && !w.threw && w.rej === 0 && !w.live, `${tag} death mid-walk: walkDirect returns false (${w.r}), no throw, no unhandled rejection (${w.rej}), no live walker (${w.live})`);
    }
    // S4 slow walk: a hop takes longer than GoToPoint's 15 s timeout
    w = await scenario(mode, { parts, own, nav, speed: 60 }, async (W, X) => {
      const r = await W.run(X.walkDirect(4000, 0, 0, 150, 200000), 210000);
      return { r, straight: W.log.straight, rej: W.unhandled.length, ms: W.t - W.t0 };
    });
    T(w.r === true && w.rej === 0, `${tag} slow walk (60 u/s, hops > 15 s): arrives (${w.r}, ${Math.round(w.ms / 1000)} s), no unhandled rejection`);
    T(w.straight === 0, `${tag} slow walk: a timeout while still walking re-issues the native walk, no flip to straight lines (straight: ${w.straight})`);
    // S5 wall: stuck, give up, the native walker is stopped
    w = await scenario(mode, { parts, own, nav, wallX: 2000 }, async (W, X) => {
      const r = await W.run(X.walkDirect(3000, 0, 0, 150, 90000), 100000);
      const live = !!(W.op && W.op.alive); await W.run(new Promise(res => W.at(3000, res)), 10000);
      return { r, live, rej: W.unhandled.length };
    });
    T(w.r === false && w.rej === 0, `${tag} wall: walkDirect gives up (false: ${w.r}), no unhandled rejection (${w.rej})`);
    if (mode === 17) T(!w.live, `${tag} wall: after giving up no native walker of this walk is still alive (${w.live})`);
    // S6 user move (/moveto, override) vs a running walk
    if (own) {
      w = await scenario(mode, { parts, own, nav }, async (W, X) => {
        const A = X.walkDirect(6000, 0, 11, 150, 160000); let U = null, ur = null;
        W.at(3000, () => { W.markZ = true; W.zDuring = { 11: 0, 0: 0 }; U = X.navUserMove(500, 3000, undefined, 'moveto'); U.then(r => { ur = r; W.markZ = false; }); });
        const rA = await W.run(A, 170000);
        return { rA, ur, aDuring: W.zDuring ? W.zDuring[11] : -1, rej: W.unhandled.length };
      });
      T(w.rA === true && w.ur && w.ur.ok && w.rej === 0, `${tag} user move during a walk: the move arrives (${w.ur && w.ur.ok}), then the walk goes on and arrives (${w.rA}), no unhandled rejection`);
      T(w.aDuring === 0, `${tag} user move during a walk: the walk sends nothing while the user move runs (${w.aDuring})`);
    }
    // S7 straight walk right after a native walk returned early (its walker still going)
    if (mode === 17) {
      w = await scenario(mode, { parts, own, nav }, async (W, X) => {
        const r1 = await W.run(X.walkDirect(2000, 0, 0, 300, 30000), 40000);
        const ov0 = W.log.overrides; const alive0 = !!(W.op && W.op.alive);
        const r2 = await W.run(X.walkDirect(2000, 1500, 0, 100, 30000, null, true), 40000);
        return { r1, r2, alive0, ov: W.log.overrides - ov0, rej: W.unhandled.length };
      });
      T(w.r1 && w.r2 && w.rej === 0, `${tag} straight walk after a native walk: both arrive (${w.r1}, ${w.r2})`);
      T(!w.alive0, `${tag} a returned walk leaves no native walker behind (3.8.17 would stop me up to 15 s later; alive after return: ${w.alive0})`);
      T(w.ov === 0, `${tag} straight walk after a native walk: no native walker overrides the straight moves (overrides: ${w.ov})`);
    }
  }
  return res;
}

/** one simulation run: a fresh vm context with the file's walk code and a simulated L2Swarm */
async function scenario(mode, opt, body) {
  const W = makeWorld(mode, opt);
  const ctx = {
    Me: W.me, rest: { sitting: false }, state: {}, CONFIG: { nav: opt.nav, travel: { maxWalk: 25000 } },
    __W: W, __MODE: mode, console,
    setTimeout: (fn, ms) => W.timer(fn, ms, 0), setInterval: (fn, ms) => W.timer(fn, ms, ms), clearTimeout: (id) => W.clear(id), clearInterval: (id) => W.clear(id),
    now: () => W.t, sleep: (ms) => new Promise(r => W.timer(r, ms, 0)),
    onRouteWalk: () => false, noNativeNav: () => false, rtFlag: (k, d) => d, nativeNearHop: () => 0, sendAppearing: () => { }, note: (m) => W.notes.push(m),
    RunCommand: () => { }, logError: () => { },
    Send: { MoveBackwardToLocation: (x, y, z) => W.straight(x, y, z), StopMove: () => { W.target = null; } },
  };
  vm.createContext(ctx);
  vm.runInContext(`
    function distTo(x, y) { return Math.hypot(Me.X - x, Me.Y - y); }
    function Point3D(x, y, z) { this.X = x; this.Y = y; this.Z = z; }
    function MoveToPoint(x, y, z, ok, fail) {
      if (typeof x === 'object') { fail = z; ok = y; z = x.Z; y = x.Y; x = x.X; }
      else if (typeof z !== 'number') { fail = ok; ok = z; z = 0; }
      return __W.start(x, y, z, ok, fail);
    }
    function GoToPoint(x, y, z, ms) {
      return new Promise(function (resolve, reject) {
        var px = parseInt(x), py = parseInt(y), dz = z === undefined ? 0 : parseInt(z), timeout = ms === undefined ? 60000 : ms;
        var settled = false, poll = null, tmo = null, movement = null;
        function finish(err) {
          if (settled) return; settled = true;
          if (poll !== null) clearInterval(poll); if (tmo !== null) clearTimeout(tmo);
          if (__MODE === 17) { try { if (movement != null) movement.Stop(!err); } catch (e) { } }
          if (err) reject(err); else resolve();
        }
        function check() {
          if (settled) return true;
          if (__MODE === 17 && Me.IsDead) { finish(new Error('Cannot move to point: character died.')); return true; }
          var dx = Me.X - px, dy = Me.Y - py; if (dx * dx + dy * dy <= 45 * 45) { finish(); return true; } return false;
        }
        try {
          if (check()) return;
          poll = setInterval(check, 100);
          tmo = setTimeout(function () { if (!check()) finish(new Error('GoToPoint timed out after ' + timeout + ' ms moving to ' + px + ', ' + py + ', ' + dz)); }, timeout);
          movement = MoveToPoint(px, py, dz, check, function (reason) { finish(new Error('Cannot move to point ' + px + ', ' + py + ', ' + dz + (reason ? ': ' + reason : ''))); });
          if (settled && movement != null) movement.Stop();
        } catch (e) { finish(e); }
      });
    }
  `, ctx);
  vm.runInContext((opt.own || '') + '\n' + opt.parts.join('\n') + '\nglobalThis.__X = { walkDirect, navUserMove: typeof navUserMove === "function" ? navUserMove : null };', ctx);
  const onRej = (e) => W.unhandled.push(e);
  process.on('unhandledRejection', onRej);
  try { return await body(W, ctx.__X); } finally { await W.flush(); process.removeListener('unhandledRejection', onRej); }
}

function makeWorld(mode, opt) {
  const W = {
    mode, t0: 1e9, t: 1e9, seq: 0, timers: [], notes: [], unhandled: [],
    me: { X: 0, Y: 0, Z: 0, IsDead: false, IsMoving: false, IsSitting: false },
    speed: opt.speed || 150, wallX: opt.wallX || null,
    target: null, op: null, walker14: null, stall: 0, lastOverride: 0,
    log: { moves: 0, straight: 0, cancels: 0, overrides: 0 }, markZ: false, zDuring: null,
  };
  W.timer = (fn, ms, every) => { const id = ++W.seq; W.timers.push({ id, at: W.t + Math.max(0, Number(ms) || 0), fn, every: every ? Math.max(1, every) : 0 }); return id; };
  W.clear = (id) => { const k = W.timers.findIndex(x => x.id === id); if (k >= 0) W.timers.splice(k, 1); };
  W.at = (ms, fn) => W.timer(fn, ms, 0);
  const noteZ = (z) => { if (W.markZ && W.zDuring && W.zDuring[z] !== undefined) W.zDuring[z]++; };
  // a native script movement (3.8.17: a handle; a new one cancels the old one with a reason)
  W.start = (x, y, z, ok, fail) => {
    W.log.moves++; noteZ(z);
    if (mode === 17) {
      if (W.op && W.op.alive) { W.log.cancels++; W.op.Stop(false); }
      const op = { alive: true, dest: { x, y }, ok, fail, get IsAlive() { return this.alive; },
        Stop(success) { if (!this.alive) return; this.alive = false; if (W.op === this) W.target = null; const f = this.fail; this.fail = null; this.ok = null; if (f) f(success ? null : 'Script movement cancelled.'); } };
      W.op = op; W.target = { x, y }; W.stall = 0;
      return op;
    }
    W.walker14 = { alive: true, dest: { x, y } }; W.target = { x, y }; W.stall = 0;
    return undefined;
  };
  W.straight = (x, y, z) => { W.log.straight++; noteZ(z); W.target = { x, y }; };
  W.step = (dt) => {
    const me = W.me;
    if (me.IsDead) { me.IsMoving = false; if (W.op && W.op.alive && mode === 17) { const o = W.op; o.alive = false; const f = o.fail; o.fail = null; if (f) f('character died'); } return; }
    // the native walker re-asserts its own destination against a straight server move (every 500 ms)
    const wk = mode === 17 ? (W.op && W.op.alive ? W.op : null) : (W.walker14 && W.walker14.alive ? W.walker14 : null);
    if (wk && W.target && (W.target.x !== wk.dest.x || W.target.y !== wk.dest.y) && W.t - W.lastOverride >= 500) { W.target = { x: wk.dest.x, y: wk.dest.y }; W.lastOverride = W.t; W.log.overrides++; }
    if (wk && !W.target) W.target = { x: wk.dest.x, y: wk.dest.y };
    if (!W.target) { me.IsMoving = false; return; }
    const dx = W.target.x - me.X, dy = W.target.y - me.Y, d = Math.hypot(dx, dy), stepLen = W.speed * dt / 1000;
    if (d <= Math.max(5, stepLen)) {
      me.X = W.target.x; me.Y = W.target.y; me.IsMoving = false; W.target = null;
      if (wk) { wk.alive = false; if (mode === 17) { const okf = wk.ok; wk.fail = null; wk.ok = null; if (okf) okf(); } }
      return;
    }
    let nx = me.X + dx / d * stepLen, ny = me.Y + dy / d * stepLen;
    if (W.wallX !== null && nx > W.wallX) nx = W.wallX;
    const moved = Math.hypot(nx - me.X, ny - me.Y);
    me.X = nx; me.Y = ny; me.IsMoving = moved > 0.5;
    if (moved < 0.5) {
      W.stall += dt;
      if (wk && W.stall >= 3000) { wk.alive = false; W.target = null; if (mode === 17) { const f = wk.fail; wk.fail = null; if (f) f('path blocked after 3 recalculations'); } }
    } else W.stall = 0;
  };
  W.flush = async () => { for (let k = 0; k < 6; k++) await new Promise(r => setImmediate(r)); };
  /** run the fake clock until promise p settles (or limit ms of game time) */
  W.run = async (p, limit) => {
    let done = false, val, err = null;
    Promise.resolve(p).then(v => { done = true; val = v; }, e => { done = true; err = e; });
    const end = W.t + limit;
    while (!done && W.t < end) {
      await W.flush(); if (done) break;
      let nx = null; for (const tm of W.timers) if (!nx || tm.at < nx.at || (tm.at === nx.at && tm.id < nx.id)) nx = tm;
      const nextAt = nx ? Math.min(nx.at, W.t + 100) : W.t + 100;
      if (nextAt > W.t) { W.step(nextAt - W.t); W.t = nextAt; }
      if (nx && nx.at <= W.t) { if (nx.every) nx.at += nx.every; else W.timers.splice(W.timers.indexOf(nx), 1); try { nx.fn(); } catch (e) { W.notes.push('timer threw ' + e.message); } }
    }
    await W.flush();
    if (err) throw err;
    return done ? val : 'TIMEOUT';
  };
  return W;
}
