// OFFLINE TEST of the Seven Signs SKIP EXPLANATION (tester l3tal 2026-10-15: "bots can't get back to necropolises and catacombs they went to
// before"): every outcome of the catacomb / necropolis gate (swarm.js SSGATE-PURE ssGateDecide + SSOPTIN-PURE ssoGate) has ONE plain
// sentence (ssgReason), and the bot and the dashboard use the SAME words:
//   1) the copies are identical: Scripts_dev/swarm.js SSGATE-PURE / SSOPTIN-PURE  ==  Dashboard/index.html SSGATE-UI  ==  Dashboard/sslogic.js
//   2) every outcome code -> its sentence (one sentence, no "undefined", the next change in local time where it matters)
//   3) bot == dashboard: the same scenarios run through all three copies give the same sentence
//   4) wiring: the bot's notes (skip, trip refused, chosen spot blocked, !dungeon, resume) say ssgReason; the dashboard shows it (spot picker rows,
//      the dungeon map banner, the party card line, the choice dialog / hunt popup, the 7 Signs tab, the Automations page)
//   node docs/plan/tools/test_seven_signs_reasons.js      (exit code 1 when a check fails)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const rdT = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const src = rdT('Scripts_dev/swarm.js'), html = rdT('Dashboard/index.html'), sslSrc = rdT('Dashboard/sslogic.js');
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (s, b, e) => { const i = s.indexOf(b), j = s.indexOf(e, i + 1); if (i < 0 || j < i) throw new Error(b + ' block not found'); return s.slice(i, j); };
const fsrc = (s, n) => { const i = s.indexOf('function ' + n + '('); if (i < 0) return null; const rest = s.slice(i); const m = rest.slice(1).search(/\n(function |\/\*\*|\/\/ |const )/); return rest.slice(0, m < 0 ? undefined : m + 1).trimEnd(); };
const dedent = (s) => s.split('\n').map(l => l.replace(/^  /, '')).join('\n');

// ---- 1) the copies --------------------------------------------------------------------------------------------------------------
const SSG = blk(src, '// SSGATE-PURE-BEGIN', '// SSGATE-PURE-END'), SSO = blk(src, '// SSOPTIN-PURE-BEGIN', '// SSOPTIN-PURE-END');
const UI = blk(html, '// SSGATE-UI-BEGIN', '// SSGATE-UI-END'), COPY = dedent(blk(sslSrc, '// COPY-BEGIN', '// COPY-END'));
const GATE_FNS = ['ssgWeek', 'ssgCycleOf', 'ssgNextChange', 'ssgNow', 'ssgSide', 'ssgOne', 'ssGateDecide', 'ssgUntilText', 'ssgReason'], OPT_FNS = ['ssoNorm', 'ssoEnrolled', 'ssoGate'];
{
  const d1 = GATE_FNS.filter(n => !fsrc(UI, n) || fsrc(UI, n) !== fsrc(SSG, n));
  check(!d1.length, `index.html SSGATE-UI == swarm.js SSGATE-PURE (${GATE_FNS.length} functions incl. ssgReason)${d1.length ? ' — DIFFERENT: ' + d1.join(', ') : ''}`);
  const d2 = GATE_FNS.filter(n => !fsrc(COPY, n) || fsrc(COPY, n) !== fsrc(SSG, n));
  check(!d2.length, `Dashboard/sslogic.js == swarm.js SSGATE-PURE${d2.length ? ' — DIFFERENT: ' + d2.join(', ') : ''}`);
  const d3 = OPT_FNS.filter(n => !fsrc(COPY, n) || fsrc(COPY, n) !== fsrc(SSO, n));
  check(!d3.length, `Dashboard/sslogic.js == swarm.js SSOPTIN-PURE (${OPT_FNS.join(', ')})${d3.length ? ' — DIFFERENT: ' + d3.join(', ') : ''}`);
}
const BOT = new Function(blk(src, '// ESCPURE-BEGIN', '// ESCPURE-END') + '\n' + SSG + '\n' + SSO + `\nreturn { ${GATE_FNS.concat(OPT_FNS).join(', ')} };`)();
const DASH = new Function(UI + `\nreturn { ${GATE_FNS.join(', ')} };`)();
const SSL = require(path.join(ROOT, 'Dashboard', 'sslogic.js'));

// ---- 2) every outcome -> one sentence -------------------------------------------------------------------------------------------
const H = 18, EVERY = 6 * 3600e3, T = (iso) => Date.parse(iso);
const NOW = T('2026-10-15T10:00:00Z');                                            // Thursday of the week that started Mon 2026-10-12 18:00 UTC
const COMP = { period: 'competition', checkedAt: T('2026-10-12T18:30:00Z') };      // cycle 2026-10-12
const VALD = (w) => ({ period: 'validation', winner: w, checkedAt: T('2026-10-12T18:30:00Z') });   // validation of cycle 2026-10-05
const m = (name, rec, base) => ({ name, rec: rec || {}, base: !!base });
const signedC = { cycle: '2026-10-12', status: 'signed' }, signedV = { cycle: '2026-10-05', status: 'signed' }, duskV = { cycle: '2026-10-05', status: 'dusk' };
const enrolledNone = () => false, enrolledAll = () => true;
const nextLocal = BOT.ssgUntilText(BOT.ssgNextChange(NOW, H)) + ' (local time)';
// [code, state, M (members), period state, opts, enrolled (ssoGate; null = not applied), expected sentence regex]
const S = [
  ['off', 'enter', [m('Aa')], COMP, { enabled: false }, null, /^Open: the Seven Signs check is switched off\.$/],
  ['try', 'enter', [m('Aa')], COMP, { mode: 'try' }, null, /^Open: the Seven Signs gate is set to "try" — the party goes to the Ziggurat and the Ziggurat decides/],
  ['signed', 'enter', [m('Aa', signedC), m('Bb', signedC)], COMP, {}, enrolledAll, /^Open: everyone in the party is signed up with the Lords of Dawn this week\.$/],
  ['winner', 'enter', [m('Aa', signedV)], VALD('dawn'), {}, enrolledAll, /^Open: it is the Seven Signs validation week, Dawn won and everyone was on the Dawn side\.$/],
  ['nowinner', 'enter', [m('Aa', signedV)], VALD('none'), {}, enrolledAll, /^Open: it is the Seven Signs validation week and everyone was signed up in the last competition/],
  ['nobody', 'enter', [], COMP, {}, enrolledAll, /^Open: nobody in the party is blocked by the Seven Signs\.$/],
  ['signup', 'signup', [m('Aa', signedC), m('Bb'), m('Cc')], COMP, {}, enrolledAll, /^Not signed up yet: Bb, Cc — it is the competition week, so the leader takes them to the Priest of Dawn \(free\) first, then goes in\.$/],
  ['optin', 'closed', [m('Rowan'), m('Hazel')], COMP, {}, enrolledNone, /^Not open for Rowan, Hazel: not signed up with the Lords of Dawn, and the Seven Signs sign-up is switched off for them — sign up on the 7 Signs tab/],
  ['unknown', 'check', [m('Aa')], {}, {}, enrolledAll, /^Unknown: no character has read the Priest of Dawn's page this cycle yet/],
  ['optin-check', 'closed', [m('Aa')], {}, {}, enrolledNone, /^Seven Signs sign-up is switched off for this party \(opt-in on the 7 Signs tab\)/],
  ['notsigned', 'closed', [m('Aa'), m('Bb')], VALD('dawn'), {}, enrolledAll, new RegExp('^Closed this week: it is the Seven Signs validation period and Aa, Bb were not signed up in the last competition — opens again ' + nextLocal.replace(/[()]/g, '\\$&') + ' \\(next competition\\)\\.$')],
  ['loser', 'closed', [m('Aa', signedV)], VALD('dusk'), {}, enrolledAll, /^Closed this week: it is the Seven Signs validation period and Dusk won, so only Dusk members may enter — Aa is not — opens again .+ \(local time\) \(next competition\)\.$/],
  ['base', 'closed', [m('Aa', {}, true)], COMP, {}, enrolledAll, /^Not open for Aa: no 1st class transfer yet, so it cannot join the Seven Signs — change class first\.$/],
  ['denied', 'closed', [m('Aa', { cycle: '2026-10-12', status: 'signed', denied: { cycle: '2026-10-12', period: 'competition', kind: 'catacomb', dungeon: 'Catacomb of the Branded', why: 'may not pass' } })], COMP, {}, enrolledAll, /^Closed for Aa until .+ \(local time\): the Ziggurat refused it this period\.$/],
  ['fee', 'closed', [m('Aa', { cycle: '2026-10-12', status: 'fee' })], COMP, {}, enrolledAll, /^Not open for Aa this week: the Priest of Dawn asked for a fee or an item \(not paid\)/],
  ['tries', 'closed', [m('Aa', { cycle: '2026-10-12', status: 'failed', tries: 3 })], COMP, {}, enrolledAll, /^Not open for Aa this week: the Dawn sign-up failed 3 times — press Sign up on the 7 Signs tab to try again\.$/],
  ['break', 'check', [m('Aa')], null, {}, enrolledAll, /^Short Seven Signs break \(15 minutes at the Monday change\)/],
];
const run = (L, sc, o) => {
  let cur = sc[3] ? L.ssgNow(sc[3], NOW, H, EVERY) : { period: 'results', winner: '', cycle: '2026-10-12', stale: false, nextChange: L.ssgNextChange(NOW, H) };   // 'break' = the 15-min results break
  let g = L.ssGateDecide(cur, sc[2], 'catacomb', Object.assign({ maxTries: 3 }, sc[4]));
  if (sc[5] && L.ssoGate) g = L.ssoGate(g, sc[2].map(x => x.name), sc[5]);
  return { g, cur, reason: L.ssgReason(g, cur) };
};
const codesSeen = new Set();
for (const sc of S) {
  const b = run(BOT, sc);
  codesSeen.add(b.g.code);
  const one = !/undefined|NaN|null|\[object/.test(b.reason) && /\.$/.test(b.reason) && !/\n/.test(b.reason) && b.reason.length < 400;
  check(b.g.code === sc[0] && b.g.state === sc[1] && sc[6].test(b.reason) && one, `${sc[0].padEnd(11)} (${b.g.state}): "${b.reason}"`);
  // 3) the dashboard says the same: index.html SSGATE-UI (gate functions; ssoGate = the bot's, the picker has its own consent rule) + sslogic.js
  const dl = Object.assign({}, DASH, { ssoGate: BOT.ssoGate });
  const d = run(dl, sc), s2 = run(SSL, sc);
  check(d.reason === b.reason && s2.reason === b.reason, `   dashboard (index.html + sslogic.js) == bot for "${sc[0]}"`);
}
// the 2 extra closings in one party: who is named, the rest counted
{
  const sc = ['base', 'closed', [m('Aa', {}, true), m('Bb', {}, true), m('Cc', { cycle: '2026-10-12', status: 'fee' })], COMP, {}, enrolledAll];
  const r = run(BOT, sc);
  check(/^Not open for Aa, Bb: .* \(1 more member is closed for another reason\)\.$/.test(r.reason), `several closed: the first reason names its members, the others are counted: "${r.reason}"`);
}
// every code ssgOne / ssGateDecide / ssoGate can return is covered by a scenario above
{
  const codes = new Set();
  [SSG, SSO].forEach(s => { (s.match(/, '([a-z-]+)'\)(?:;| :)/g) || []).forEach(x => codes.add(x.match(/'([a-z-]+)'/)[1])); (s.match(/code: '([a-z-]+)'/g) || []).forEach(x => codes.add(x.match(/'([a-z-]+)'/)[1])); });
  ['signup', 'nobody'].forEach(c => codes.add(c));
  const missing = [...codes].filter(c => !codesSeen.has(c));
  check(!missing.length && codes.size >= 17, `every gate outcome has a scenario + sentence (${codes.size} codes: ${[...codes].sort().join(', ')})${missing.length ? ' — MISSING: ' + missing.join(', ') : ''}`);
  const rsrc = fsrc(SSG, 'ssgReason');
  const unhandled = [...codes].filter(c => !['nobody'].includes(c) && !new RegExp(`c === '${c}'`).test(rsrc));
  check(!unhandled.length, `ssgReason has its own sentence for every code${unhandled.length ? ' — NOT: ' + unhandled.join(', ') : ''}`);
}
// the next change is the machine's local time (Mon 18:00 UTC)
{
  const nc = BOT.ssgNextChange(NOW, H), d = new Date(nc);
  check(d.getUTCDay() === 1 && d.getUTCHours() === 18 && BOT.ssgUntilText(nc) === `Mon ${d.getDate()} Oct ${String(d.getHours()).padStart(2, '0')}:00`, `next change in local time: "${BOT.ssgUntilText(nc)}" (= ${d.toISOString()})`);
}

// ---- 4) wiring ------------------------------------------------------------------------------------------------------------------
{
  const fn = (sig) => { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j); };
  check(/v\.reason = ssgReason\(v, cur\)/.test(fn('function ssTeamAllowed(')), 'bot: ssTeamAllowed attaches the sentence (v.reason = ssgReason)');
  check(/reason: ssgReason\(g, cur\)/.test(fn('function ssAllowed(')), 'bot: ssAllowed (the per-character view the 7 Signs tab shows) carries the sentence');
  check(/skipping \$\{k\} — \$\{a\.reason \|\| a\.why\}/.test(fn('function ssSpotOk(')), 'bot: the automatic spot skip note says the sentence');
  const trip = fn('async function ssGateTrip(');
  check(/NOT going to \$\{spotName\} — \$\{g\.reason \|\| g\.why\}/.test(trip) && /still not allowed into \$\{spotName\}: \$\{g\.reason \|\| g\.why\}/.test(trip), 'bot: the trip gate (refused / still not allowed) says the sentence');
  check(/kind: 'blocked', detail: `\$\{g\.reason \|\|/.test(src) && /\$\{label\} — \$\{g\.reason \|\|/.test(src), 'bot: a chosen spot that is blocked: the party card status (detail) and the note say the sentence');
  check((src.match(/NOT going into \$\{d\.name\} — \$\{[ag]\.reason \|\| [ag]\.why\}/g) || []).length === 2 && /NOT back into \$\{d\.name\} — \$\{g\.reason \|\| g\.why\}/.test(src), 'bot: !dungeon, enterDungeon and the resume say the sentence');
  check(/return Object\.assign\(g, \{ cur, reason: ssgReason\(g, cur\) \}\)/.test(html), 'dashboard: ssGateParty attaches the same sentence');
  check((html.match(/ssChipWhy\(ssGateParty\(SPK\.party/g) || []).length >= 4 /* 2 picker rows + 2 spot map info panels (SPOTMAP-2026-10-22) */ &&/ssChipWhy\(ssg, true\)/.test(html) && /' ' \+ ssChipWhy\(ssd\)/.test(html), 'dashboard: spot picker rows (dungeons + zones), the dungeon map banner and the party card hunting line show it');
  check(/\$\{g\.reason \|\| g\.why\}\\n\\nThe party will NOT go there/.test(html) && /parts\.push\(g\.reason \|\|/.test(html), 'dashboard: the "is closed now" dialog and the hunt popup notes use it');
  check(/class="ssreason"/.test(html) && /\.ssreason \{/.test(html), 'dashboard: the sentence is visible text (phones have no tooltips) with its own style');
  const s7 = rdT('Dashboard/sevensigns.js'), s7api = rdT('Dashboard/sevensigns_api.js'), auApi = rdT('Dashboard/autooverview_api.js');
  check(/function gateHtml\(g\)/.test(s7) && /\$\{gateHtml\(p\.gate\)\}/.test(s7) && /m\.reason \|\| m\.why/.test(s7), '7 Signs tab: one gate sentence per party (+ the member tooltip)');
  check(/SSL\.partyGate\(/.test(s7api) && /reason: v\.reason/.test(s7api), '7 Signs API: party gate through Dashboard/sslogic.js partyGate');
  check(/SSL\.partyGate\(/.test(auApi) && /Catacombs \/ necropolises: ' \+ sevenSigns\.catacomb\.reason/.test(auApi), 'Automations page: the Seven Signs row shows the same sentence');
}
// the 7 Signs API on a scratch folder: a party in the validation week, nobody signed up -> the closed sentence with the next change
{
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-')), D = path.join(TMP, 'data'), L = path.join(TMP, 'logs'); fs.mkdirSync(D); fs.mkdirSync(L);
  const w = (p, o) => fs.writeFileSync(p, JSON.stringify(o));
  const tNow = Date.now(), H0 = SSL.ssgNow({ period: 'validation', winner: 'dawn', checkedAt: tNow - 3600e3 }, tNow, H, EVERY);
  w(path.join(L, 'sevensigns_state.json'), { period: 'validation', winner: 'dawn', checkedAt: tNow - 3600e3 });
  w(path.join(D, 'seven_signs.json'), { parties: ['Alpha'], chars: [], contributeStones: true });
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
  const ctx = { ROOT, DIR: path.join(ROOT, 'Dashboard'), DATA: D, LOGS: L, readJson, readStates: () => [{ name: 'Alpha', party: 'Alpha' }, { name: 'Beta', party: 'Alpha' }],
    teamMap: () => ({ Alpha: 'Alpha', Beta: 'Alpha' }), reloadCfg: () => ({ accounts: [{ character: 'Alpha' }, { character: 'Beta' }] }), mainLeader: 'Alpha', sevenSignsFile: path.join(D, 'seven_signs.json') };
  const prev = process.env.SWARM_SEVENSIGNS_FILE; process.env.SWARM_SEVENSIGNS_FILE = path.join(D, 'seven_signs.json');
  let info = null; try { info = require(path.join(ROOT, 'Dashboard', 'sevensigns_api.js')).info(ctx); } catch (e) { console.log('   ' + e.message); }
  if (prev === undefined) delete process.env.SWARM_SEVENSIGNS_FILE; else process.env.SWARM_SEVENSIGNS_FILE = prev;
  const p = info && info.parties.find(x => x.leader === 'Alpha');
  const want = `Closed this week: it is the Seven Signs validation period and Alpha, Beta were not signed up in the last competition — opens again ${SSL.ssgUntilText(H0.nextChange)} (local time) (next competition).`;
  check(!!(p && p.gate && p.gate.same && p.gate.catacomb.reason === want && p.gate.catacomb.state === 'closed'), `7 Signs API (scratch files): "${p && p.gate ? p.gate.catacomb.reason : '?'}"`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
