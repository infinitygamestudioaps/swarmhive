// OFFLINE TEST of the Seven Signs OPT-IN (user 2026-10-12: "Priest of Dawn should not be a given; it must be something you sign up for. Make
// a tab called '7 Signs' where you can enroll groups or single accounts so they sign up automatically. And at the same time respect other
// commands — such things must never override a quest command").
//   node docs/plan/tools/test_sevensigns_optin.js [path to swarm.js]     (default Scripts_dev/swarm.js; env SWARM_JS works too)
//   exit code 1 when a check fails; nothing reaches the game, MCP, the live Logs or Scripts/data (the API part uses a temp folder).
// 1) SSOPTIN-PURE (swarm.js): ssoNorm, ssoEnrolled (character / party, any case, missing file = nobody), ssoStones, ssoBusyWhy (quest, user
//    order, order-level control first; leveling / upkeep do not block), ssoPick (automatic = enrolled only, manual = everyone, '!dawn <name>'),
//    ssoGate on top of the real SSGATE-PURE ssGateDecide (a sign-up for someone not enrolled = closed + "7 Signs tab").
// 2) Source wiring: every automatic path (town tick, Giran regroup / ssTeamSignup, the 5-min leader run, members answering swarm.dawn, the
//    dungeon gate, seal stones, stash) checks enrollment + ssBusyWhy; '!dawn [name]'; the priest page fixes (competition is underway /
//    "Participation in the Seven Signs", checked against the live page Logs/dawn_period.html when present).
// 3) Dashboard: sevensigns_api.js (sanitize, info from temp state files + bag counts, post with lock / rev conflict / history), the page
//    script (no browser alert / confirm / prompt), the wiring in index.html / server.js / commands.js, the seed file.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const F = process.argv.slice(2).filter(a => !/^--/.test(a))[0] || process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(F, 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(`${b} block not found in ${F} (patch not applied?)`); process.exit(1); } return src.slice(i, j); };
const M = new Function(blk('// SSGATE-PURE-BEGIN', '// SSGATE-PURE-END') + '\n' + blk('// SSOPTIN-PURE-BEGIN', '// SSOPTIN-PURE-END') +
  '\nreturn { ssgNow, ssGateDecide, ssoNorm, ssoEnrolled, ssoStones, ssoBusyWhy, ssoPick, ssoGate };')();
console.log('swarm.js: ' + F);

// ---- 1) pure ------------------------------------------------------------------------------------------------------------------
const none = M.ssoNorm(null);
check(!none.exists && !none.parties.length && !none.chars.length && none.contributeStones === null, 'missing / broken file = nobody enrolled, stones switch not set');
check(!M.ssoNorm([1, 2]).exists && !M.ssoNorm('x').exists, 'an array / a string is not a settings file');
const cfg = M.ssoNorm({ parties: ['Tank1', ' ', null], chars: ['Dagger1', 'healer6'], contributeStones: false });
check(cfg.parties.length === 1 && cfg.chars.length === 2 && cfg.contributeStones === false, 'names trimmed, blanks dropped, switch kept');
check(M.ssoEnrolled(cfg, 'Bishop1', 'Tank1') && M.ssoEnrolled(cfg, 'Tank1', 'Tank1'), 'party Tank1 enrolled -> every member (and the leader) enrolled');
check(M.ssoEnrolled(cfg, 'Dagger1', 'Dagger1') && M.ssoEnrolled(cfg, 'Healer6', 'Destroyer3'), 'single characters enrolled (any case), whatever their party');
check(!M.ssoEnrolled(cfg, 'Nuker7', 'Tank3') && !M.ssoEnrolled(none, 'Bishop1', 'Tank1') && !M.ssoEnrolled(cfg, '', 'Tank1'), 'not listed / no file / no name = not enrolled');
check(M.ssoStones(cfg, true) === false && M.ssoStones(M.ssoNorm({ contributeStones: true }), false) === true && M.ssoStones(none, true) === true && M.ssoStones(none, false) === false, 'seal stones: the file wins, else CONFIG');
const B = (o) => M.ssoBusyWhy(Object.assign({ quest: false, order: '', owner: '', level: 99, orderLevel: 4 }, o));
check(B({}) === '', 'nothing runs -> free');
check(/quest/.test(B({ quest: true })), 'a quest runs -> automatic Seven Signs steps aside (the user rule)');
check(/park/.test(B({ order: '!park start' })) && B({ order: '!dawn' }) === '', 'your order runs -> steps aside; the !dawn order itself does not block');
check(/supply/.test(B({ owner: '!supply', level: 4 })) && /left behind/.test(B({ owner: 'regroup: left behind', level: 2 })), 'an order-level task (P4) / team safety (P2) holds control -> steps aside');
check(B({ owner: 'leveling', level: 5 }) === '' && B({ owner: 'town sell', level: 6 }) === '', 'leveling / upkeep do not block (the leader stops leveling for it, as before)');
const enr = (x) => M.ssoEnrolled(cfg, x, x === 'Dagger1' ? 'Dagger1' : 'Tank1');
check(JSON.stringify(M.ssoPick(['Bishop1', 'Nuker7', 'Dagger1'], (x) => x !== 'Nuker7', false, null)) === '["Bishop1","Dagger1"]', 'automatic: only the enrolled go');
check(M.ssoPick(['Bishop1', 'Nuker7'], () => false, true, null).length === 2, '!dawn (manual): everyone of the team, enrolled or not');
// neutral names, not roster names: the package builder replaces a roster name only in its own casing when it is also an English word
check(JSON.stringify(M.ssoPick(['Alphawarden', 'Bravowarden'], () => false, true, ['alphawarden'])) === '["Alphawarden"]', '!dawn Alphawarden: only Alphawarden (any case)');

// ssoGate on the real gate
const T = (s) => Date.parse(s);
const comp = M.ssgNow({ period: 'competition', checkedAt: T('2026-10-12T18:20:00Z') }, T('2026-10-12T19:00:00Z'), 18, 6 * 3600e3);
const mem = (name, status) => ({ name, rec: status ? { cycle: comp.cycle, status } : {}, base: false });
const gSign = M.ssGateDecide(comp, [mem('Tank1'), mem('Bishop1')], 'catacomb', {});
check(gSign.state === 'signup' && gSign.need.length === 2, 'base: competition, nobody signed up -> sign-up first');
check(M.ssoGate(gSign, ['Tank1', 'Bishop1'], (x) => true) === gSign, 'enrolled party -> unchanged: the trip signs everyone up first');
const gC = M.ssoGate(gSign, ['Tank1', 'Bishop1'], (x) => x === 'Tank1');
check(gC.state === 'closed' && !gC.ok && gC.optin && /Bishop1 is not signed up and not enrolled/.test(gC.why) && /7 Signs tab/.test(gC.why) && gC.until === 0, 'Bishop1 not enrolled -> closed + "enroll on the 7 Signs tab" (no date)');
const gIn = M.ssGateDecide(comp, [mem('Tank1', 'signed'), mem('Bishop1', 'member')], 'catacomb', {});
check(gIn.ok && M.ssoGate(gIn, ['Tank1', 'Bishop1'], () => false) === gIn, 'everyone signed up (manually) -> may enter, enrolled or not');
const unk = M.ssgNow({}, T('2026-10-12T19:00:00Z'), 18, 6 * 3600e3), gChk = M.ssGateDecide(unk, [mem('Tank1')], 'necropolis', {});
check(gChk.state === 'check' && M.ssoGate(gChk, ['Tank1'], () => false).state === 'closed' && M.ssoGate(gChk, ['Tank1'], () => true).state === 'check', 'period unknown: nobody enrolled -> closed; enrolled -> read the priest');
const val = M.ssgNow({ period: 'validation', winner: 'dusk', checkedAt: T('2026-10-08T18:14:02Z') }, T('2026-10-08T19:50:00Z'), 18, 6 * 3600e3);
const gV = M.ssGateDecide(val, [mem('Tank1')], 'necropolis', {});
check(gV.state === 'closed' && M.ssoGate(gV, ['Tank1'], () => true) === gV, 'validation closures are not touched');

// ---- 2) source wiring ---------------------------------------------------------------------------------------------------------
const fnBody = (sig, len) => { const i = src.indexOf(sig); return i < 0 ? '' : src.slice(i, i + (len || 3000)); };
const tick = fnBody("// --- SEVEN SIGNS, automatic (user 2026-10-08)", 4200);
check(/if \(questRun\.active\) return;/.test(tick) && /if \(ssBusyWhy\(\)\) return;/.test(tick), 'town tick: quest + ssBusyWhy first');
check(/const ssMeIn = ssEnrolled\(Me\.Name\);/.test(tick) && /if \(!ssMeIn && !\(isLeader\(\) && !ssSolo\(\) && teamNames\(\)\.some\(ssEnrolled\)\)\) return;/.test(tick), 'town tick: not enrolled (and no enrolled teammate for a leader) -> never to the priest');
check(/if \(!ssMeIn \|\| !dawnPriestNear\(2500\)\) return;/.test(tick), 'town tick: the period read only by an enrolled character');
check(/if \(ssMeIn && ssStonesOn\(\) && !ssNeeds\(Me\.Name\)/.test(tick) && /if \(ssMeIn && \(ssSolo\(\) \|\| !lp/.test(tick), 'town tick: seal stones + own sign-up only when enrolled');
const sts = fnBody('async function ssTeamSignup(why, force, opt) {', 3600);
check(!!sts && /const manual = why === '!dawn' && !opt\.auto/.test(sts) && /if \(!manual && \(opt\.gate \? .*questRun\.active.* : !!ssBusyWhy\(\)\)\) return false;/.test(sts), 'ssTeamSignup: automatic calls step aside (the gate trip only for a quest)');
check(/if \(!manual && !\[Me\.Name\]\.concat\(ssSolo\(\) \? \[\] : teamNames\(\)\)\.some\(ssEnrolled\)\) return false;/.test(sts), 'ssTeamSignup: nobody enrolled -> nothing');
check(/&& \(manual \|\| ssEnrolled\(Me\.Name\)\)\) \{ await dawnPeriod\(true\)/.test(sts) && /need = ssoPick\(mates\.filter\(needs\), ssEnrolled, manual, only\)/.test(sts) && /App\.emit\('swarm\.dawn', \{ order, manual \}\)/.test(sts), 'ssTeamSignup: period read / who goes / the emit carry the enrollment');
check(!src.includes("if (why !== '!dawn' && ((typeof questRun"), 'ssTeamSignup: the old USERORDER2 head is replaced (no second check)');
const ans = fnBody("App.on('swarm.dawn'", 1400);
check(/if \(!e\.data\.manual && !ssEnrolled\(Me\.Name\)\) return;/.test(ans) && /ssSkipNote\(/.test(ans) && /questRun\.active/.test(ans) && ans.indexOf('ssSkipNote') < ans.indexOf('await sleep((e.data.order'), 'members: automatic = enrolled only; a quest / order -> skip + tell the leader (before walking)');
const ld = fnBody('async function leadDawn(opt) {', 2600);
check(/if \(opt\.auto && ssBusyWhy\(\)\) return;/.test(ld) && /ssTeamSignup\(opt\.auto \? 'automatic \(competition period\)' : '!dawn', !opt\.auto, \{ auto: !!opt\.auto, only: opt\.only \|\| null \}\)/.test(ld), 'leadDawn: auto steps aside, passes auto / only');
const auto = fnBody('let ssAutoAt = 0;', 1400);
check(/if \(ssBusyWhy\(\)\) return;/.test(auto) && /ssoPick\(.*ssEnrolled, false, null\)/.test(auto) && /leadDawn\(\{ auto: true \}\)/.test(auto), '5-min leader run: busy check, enrolled only, auto flag');
check(/ssoGate\(ssGateDecide\(ssNow\(\), ssN\.map\(ssMember\), kind, ssGateOpts\(\)\), ssN, ssEnrolled\)/.test(src) && /g\.state === 'check', \{ gate: true \}\)/.test(src), 'dungeon gate: enrollment applied (ssTeamAllowed), the gate trip passes gate:true');
check(/if \(!ssStonesOn\(\)\) return '';/.test(src) && /stones = !!\(ssStonesOn\(\) && ssEnrolled\(Me\.Name\) && /.test(src) && !/CONFIG\.sevenSigns\.contributeStones &&/.test(src), 'seal stones: the 7 Signs switch everywhere (dawnContribute, stash)');
const dc = fnBody("if (cmd === '!dawn') {", 600);
check(/const who = String\(parts\[1\] \|\| ''\)\.trim\(\);/.test(dc) && /dawnOne\(\)/.test(dc) && /if \(isLeader\(\)\) leadDawn\(\)/.test(dc), "'!dawn' = the leader's team, '!dawn <name>' = only that window");
const one = fnBody('async function dawnOne() {', 1800);
check(/questRun\.active/.test(one) && /inRaid\(\)/.test(one) && /leadDawn\(\{ only: \[Me\.Name\] \}\)/.test(one) && /townCommand\('seven signs', 'Giran'\)/.test(one), 'dawnOne: no raid / quest, a leader takes his party, a member .giran alone');
const nm = fnBody('function ssNeedsMan(n) {', 500);
check(/period !== 'competition'\) return false/.test(nm) && /BASE_CLASS_IDS\.includes\(cls\)/.test(nm) && !/maxTriesPerCycle/.test(nm), 'ssNeedsMan: your order ignores the failed-tries limit (competition period, 1st class needed)');
check(/maxTriesPerCycle && !\(now\(\) < ssManualUntil\)\) return `gave up/.test(src) && /needs = manual \? ssNeedsMan : ssNeeds/.test(sts) && /if \(manual && meToo\) ssManualUntil = /.test(sts) && /if \(e\.data\.manual\) ssManualUntil = /.test(ans) && /!\(manual \? ssNeedsMan : ssNeeds\)\(n\)/.test(sts), "!dawn signs up characters that used up their 3 automatic tries (2026-10-12 link bug)");
check(/filter\(opt\.auto \? ssNeeds : ssNeedsMan\)/.test(ld) && /!ssNeedsMan\(Me\.Name\)/.test(one) && /ssManualUntil = now\(\) \+ 600000;/.test(one + fnBody('async function dawnOneVisit() {', 900)), 'leadDawn / dawnOne use the manual need');   // DAWNONE 2026-10-13: the visit moved to dawnOneVisit
check(src.split('SSOPTIN-PURE-BEGIN').length === 2 && /SSOPTIN-2026-10-12/.test(src), 'marker present once');
const opt = fnBody('function ssOpt() {', 700);
check(/seven_signs\.json/.test(fnBody('function ssOptFile()', 200)) && /now\(\) - SSO\.at < 30000/.test(opt) && /fileStamp\(f\)/.test(opt), 'settings read live (30 s, write-time stamp)');
// the live priest page of 2026-10-12 (competition): period + the sign-up link
const reLit = (re) => { const m = src.match(re); return m ? new Function('return ' + m[1])() : null; };
const compRe = reLit(/else if \((\/competition period[^\n]*?\/i)\.test\(t\)\) period = 'competition';/), stepRe = reLit(/const steps = \[(\/participation in the seven signs[^\n]*?\/i),/);
check(!!compRe && compRe.test('[The competition is underway. New participants in the Seven Signs may start immediately.]'), 'priest page: "The competition is underway" = competition period');
check(!!stepRe && stepRe.test('Participation in the Seven Signs'),'priest page: "Participation in the Seven Signs" is the first sign-up link');
const live = path.join(ROOT, 'Logs', 'dawn_period.html');
if (fs.existsSync(live)) { const h = fs.readFileSync(live, 'utf8').replace(/<[^>]+>/g, ' '); check(compRe.test(h), 'Logs/dawn_period.html (live page) reads as the competition period'); }

// ---- 3) dashboard -------------------------------------------------------------------------------------------------------------
const D = path.join(ROOT, 'Dashboard');
const A = require(path.join(D, 'sevensigns_api.js'));
const s1 = A.ssSanitize({ parties: ['Alphawarden', 'ALPHAWARDEN', ' Bravowarden '], chars: ['Charliewarden'], contributeStones: 0, extra: 1 }, {});
check(s1.ok && s1.cfg.parties.join() === 'Alphawarden,Bravowarden' && s1.cfg.contributeStones === false && s1.cfg.extra === 1 && !!s1.cfg._readme, 'sanitize: duplicates (any case) dropped, names trimmed, switch boolean, future fields kept');
check(!A.ssSanitize({ parties: ['Bad name!'] }, {}).ok && !A.ssSanitize({ chars: 'Bishop1' }, {}).ok && !A.ssSanitize(null, {}).ok, 'sanitize: bad names / not a list / no object refused');
check(A.ssSanitize({ parties: [] }, { contributeStones: false }).cfg.contributeStones === false && A.ssSanitize({}, {}).cfg.contributeStones === true, 'sanitize: switch not sent = keep the old (default on)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss7-'));
const DATA = path.join(tmp, 'data'), LOGS = path.join(tmp, 'Logs'); fs.mkdirSync(DATA); fs.mkdirSync(LOGS);
const wj = (p, o) => fs.writeFileSync(p, JSON.stringify(o));
wj(path.join(LOGS, 'sevensigns_state.json'), { period: 'competition', checkedAt: T('2026-10-12T18:20:00Z'), by: 'Bishop1' });
wj(path.join(LOGS, 'sevensigns_Tank1.json'), { cycle: '2026-10-12', status: 'signed', at: T('2026-10-12T18:40:00Z'), signedAt: T('2026-10-12T18:40:00Z') });
wj(path.join(LOGS, 'sevensigns_Bishop1.json'), { cycle: '2026-10-12', status: 'failed', tries: 2, at: T('2026-10-12T18:59:00Z'), view: { ok: false, why: 'x' } });
wj(path.join(LOGS, 'sevensigns_Dagger1.json'), { cycle: '2026-09-28', status: 'signed' });
fs.writeFileSync(path.join(LOGS, 'dawn.log'), 'l1\nl2\n');
const SF = path.join(DATA, 'seven_signs.json');
const ctx = { DIR: D, DATA, LOGS, ROOT, sevenSignsFile: SF, mainLeader: 'Tank1',
  readJson: (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } },
  readStates: () => [{ name: 'Tank1', level: 60, cls: 'Shillien Knight', ageSec: 5, ov: { inv: [{ id: 6360, n: 3 }, { id: 6362, n: 2 }, { id: 57, n: 9 }] } }, { name: 'Bishop1', level: 58, ageSec: 500 }],
  teamMap: () => ({ Tank1: 'Tank1', Bishop1: 'Tank1', Dagger1: 'Dagger1' }), reloadCfg: () => ({ accounts: [{ character: 'Tank1' }, { character: 'Bishop1' }, { character: 'Dagger1' }] }) };
let I = A.info(ctx, T('2026-10-12T19:00:00Z'));
const m = (nm) => { let r = null; I.parties.forEach(p => p.members.forEach(x => { if (x.name === nm) r = x; })); return r; };
check(!I.exists && I.cfg.parties.length === 0 && I.cur.period === 'competition' && I.cur.cycle === '2026-10-12', 'info: no file = nobody enrolled; period / cycle from the state file');
check(m('Tank1').registered === 'dawn' && m('Bishop1').registered === '' && m('Bishop1').status === 'failed' && m('Bishop1').tries === 2 && m('Dagger1').registered === '' && m('Dagger1').status === '', 'info: registration of THIS cycle only (an old sign-up does not count)');
check(m('Tank1').stones.blue === 3 && m('Tank1').stones.red === 2 && m('Tank1').stones.total === 5 && m('Bishop1').stones === null && m('Tank1').online && !m('Bishop1').online, 'info: seal stones from the reported bag; unknown bag = null');
check(I.log.join() === 'l1,l2', 'info: dawn.log tail');
let r = A.post(ctx, { cfg: { parties: ['Tank1'], chars: ['Dagger1'], contributeStones: true }, rev: I.rev });
check(r && r.ok && fs.existsSync(SF), 'post: first save writes the file');
I = A.info(ctx, T('2026-10-12T19:00:00Z'));
check(I.parties.find(p => p.leader === 'Tank1').enrolled && m('Bishop1').enrolled && m('Bishop1').via === 'party' && m('Dagger1').via === 'char', 'info: enrolled via party / via character');
r = A.post(ctx, { cfg: { parties: [], chars: [] }, rev: 'stale-rev' });
check(r && r.code === 409 && r.conflict, 'post: a stale rev -> 409 (nothing overwritten)');
r = A.post(ctx, { cfg: { parties: [], chars: ['Bishop1'] }, rev: I.rev });
check(r && r.ok && fs.readdirSync(path.join(DATA, 'history')).some(f => /^seven_signs_/.test(f)), 'post: second save keeps a history copy');
check(A.post(ctx, { cfg: { parties: ['x y'] }, rev: r.rev }).code === 400, 'post: bad names -> 400');
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }

const page = fs.readFileSync(path.join(D, 'sevensigns.js'), 'utf8'), html = fs.readFileSync(path.join(D, 'index.html'), 'utf8'), server = fs.readFileSync(path.join(D, 'server.js'), 'utf8');
const code = page.replace(/\/\/[^\n]*/g, '');
check(!/(^|[^.\w])(alert|confirm|prompt)\s*\(/.test(code) && /uiConfirm\(/.test(page), 'page: no browser alert / confirm / prompt (uidialog uiConfirm)');
check(/'\/api\/command'/.test(page) && /'!dawn'/.test(page) && /`!dawn \$\{name\}`/.test(page), 'page: Sign up now = !dawn (party) / !dawn <name> (character) through /api/command');
check(/data-tab="sevensigns"/.test(html) && /SevenSignsPage\.route\(kind, arg\)/.test(html) && /<script src="\/sevensigns\.js"><\/script>/.test(html) && /href="\/sevensigns\.css"/.test(html), 'index.html: tab button, route, script + css');
check(/href="#\/sevensigns"/.test(html) && /function ssMark\(name\)/.test(html), 'Clan page links to the 7 Signs tab; the ssMark chips stay');
check(/require\('\.\/sevensigns_api'\)\.handle\(/.test(server) && /optin: readJson\(path\.join\(DATA, 'seven_signs\.json'\), null\)/.test(server), 'server.js: API hook + optin in /api/clan');
const CMDS = require(path.join(D, 'commands.js')), dawn = (CMDS.COMMANDS || []).find(c => c.id === 'dawn');
check(!!dawn && dawn.targets.includes('char') && dawn.nameForChar === true, "command catalog: '!dawn' to a character = '!dawn <name>'");
const seed = path.join(ROOT, 'Scripts', 'data', 'seven_signs.json');
if (fs.existsSync(seed)) { let j = null; try { j = JSON.parse(fs.readFileSync(seed, 'utf8')); } catch (e) { } check(!!j && Array.isArray(j.parties) && Array.isArray(j.chars), 'Scripts/data/seven_signs.json parses (parties / chars lists)'); }

console.log(`\n${n - fails}/${n} checks passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
