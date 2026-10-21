// ACADEMY PIPELINE — shared pure logic (owner 2026-10-21, ACADEMY-2026-10-21: "as soon as I add an account under clan and then academy it
// should create a random character with name+numbers then go to giran with the .giran command, get invited by clan Leader to academy, get
// enough funds to buy the devotion set and a common weapon and spiritshots then it should go level from 1-40"). No DOM, no host calls:
// Dashboard/academy_api.js (the manager), Dashboard/addaccount_api.js (the Academy choice) and docs/plan/tools/test_academy.js use it.
// Config: Scripts/data/academy.json. The bot side is Scripts_dev/swarm.js (party plan step kind 'academy', block ACADEMY-PURE).
'use strict';
const NAME_RE = /^[A-Za-z0-9]{2,16}$/;

const DEF = {
  on: true, race: 2, classId: 38, sexes: [0, 1], classPlan: [39, 40], role: 'nuker',
  names: { first: ['Nyx', 'Vel', 'Mor', 'Kael', 'Shad', 'Drav', 'Zar', 'Vex'], second: ['ara', 'eth', 'iel', 'ora', 'yn', 'ith'], digitsMin: 2, digitsMax: 4, tries: 6 },
  funds: { target: 2000000, need: 900000, waitMin: 45 },
  buy: { start: [], level20: [] },
  spots: { to20: { mode: 'auto' }, to25: { mode: 'auto' }, to40: { mode: 'auto' } },
  end: { logout: true, newCharacter: true, maxCharacters: 7 },
};
/** academy.json content -> a complete config (missing parts = the defaults) */
function academyCfg(j) {
  const o = j && typeof j === 'object' ? j : {};
  const out = Object.assign({}, DEF, o);
  out.names = Object.assign({}, DEF.names, o.names || {});
  out.funds = Object.assign({}, DEF.funds, o.funds || {});
  out.buy = Object.assign({}, DEF.buy, o.buy || {});
  out.spots = Object.assign({}, DEF.spots, o.spots || {});
  out.end = Object.assign({}, DEF.end, o.end || {});
  out.on = o.on !== false;
  return out;
}

/** a random character name: first + second + 2-4 digits, never one of taken (lower-case set), max 16 letters / digits.
 *  rnd = () => [0, 1) (Math.random; tests pass their own) */
function academyName(cfg, rnd, taken) {
  const C = academyCfg(cfg), N = C.names, R = typeof rnd === 'function' ? rnd : Math.random, T = taken || new Set();
  const pick = (a) => a[Math.floor(R() * a.length) % a.length];
  const first = (N.first || []).filter(x => /^[A-Za-z]+$/.test(x)), second = (N.second || []).filter(x => /^[A-Za-z]*$/.test(x));
  if (!first.length) first.push('Acad');
  if (!second.length) second.push('');
  const dMin = Math.max(1, Math.min(6, Number(N.digitsMin) || 2)), dMax = Math.max(dMin, Math.min(6, Number(N.digitsMax) || 4));
  for (let i = 0; i < 200; i++) {
    const nd = dMin + Math.floor(R() * (dMax - dMin + 1));
    let digits = ''; for (let k = 0; k < nd; k++) digits += String(Math.floor(R() * 10) % 10);
    let base = pick(first) + pick(second).toLowerCase();
    base = base.charAt(0).toUpperCase() + base.slice(1);
    const name = (base.slice(0, 16 - digits.length) + digits);
    if (NAME_RE.test(name) && !T.has(name.toLowerCase())) return name;
  }
  return 'Acad' + String(Date.now()).slice(-6);
}
/** several distinct names (the create script tries them in order when the server says a name is taken) */
function academyNames(cfg, rnd, taken, n) {
  const T = new Set(taken || []), out = [];
  for (let i = 0; i < (n || academyCfg(cfg).names.tries || 6); i++) { const nm = academyName(cfg, rnd, T); T.add(nm.toLowerCase()); out.push(nm); }
  return out;
}

/** the party plan of one academy character (Dashboard/planlogic.js step format; the 'academy' kind = swarm.js planStepAcademy) */
function academyPlanSteps(cfg) {
  const C = academyCfg(cfg), sp = C.spots, id = (k) => 'ac' + k;
  return [
    { id: id('join'), kind: 'academy', act: 'join', note: 'Giran (.giran) + the clan leader invites me into the Academy' },
    { id: id('funds'), kind: 'academy', act: 'funds', note: 'adena from the givers for the kit' },
    { id: id('buy1'), kind: 'academy', act: 'buy', set: 'start', note: 'No-Grade spiritshots' },
    { id: id('lv20'), kind: 'level', to: 20, spot: sp.to20 || { mode: 'auto' } },
    { id: id('cls1'), kind: 'class', note: '1st class (approved academy class plan)' },
    { id: id('buy2'), kind: 'academy', act: 'buy', set: 'level20', note: 'Devotion set + Common weapon + D spiritshots, worn at once' },
    { id: id('lv25'), kind: 'level', to: 25, spot: sp.to25 || { mode: 'auto' } },
    { id: id('lv40'), kind: 'level', to: 40, spot: sp.to40 || { mode: 'auto' } },
    { id: id('cls2'), kind: 'class', note: '2nd class = Academy graduation' },
    { id: id('grad'), kind: 'academy', act: 'graduate', note: 'log out; the account makes the next academy character' },
  ];
}
function academyPlan(cfg, name) {
  return { name: `Academy ${name || ''}`.trim(), on: true, steps: academyPlanSteps(cfg), template: 'academy' };
}

/** the CharCreateFail reason (L2 0x10) -> words + whether another name can help */
const CREATE_FAIL = {
  0: { why: 'the server refused the character', retry: true },
  1: { why: 'the account has no free character slot', retry: false, slotsFull: true },
  2: { why: 'the name is taken', retry: true },
  3: { why: 'the name is too long / not allowed', retry: true },
  4: { why: 'the name is not allowed', retry: true },
};
function createFailInfo(code) { return CREATE_FAIL[Number(code)] || { why: 'refused (code ' + code + ')', retry: true }; }

/** Settings/<Login>.xml text: set <SelectedCharacter> -> new text (adds it before </Option> when missing) */
function xmlSetSelected(xml, name) {
  const t = String(xml || '');
  if (/<SelectedCharacter>[^<]*<\/SelectedCharacter>/.test(t)) return t.replace(/<SelectedCharacter>[^<]*<\/SelectedCharacter>/, `<SelectedCharacter>${name}</SelectedCharacter>`);
  if (/<SelectedCharacter\s*\/>/.test(t)) return t.replace(/<SelectedCharacter\s*\/>/, `<SelectedCharacter>${name}</SelectedCharacter>`);
  return t.replace(/<\/Option>\s*$/, `  <SelectedCharacter>${name}</SelectedCharacter>\r\n</Option>\r\n`);
}
function xmlSelected(xml) { const m = String(xml || '').match(/<SelectedCharacter>([^<]*)<\/SelectedCharacter>/); return m ? m[1] : ''; }
/** make sure the one-off create script (Scripts\<file>) is in <ScriptsList> and enabled (added first) */
function xmlEnsureScript(xml, file, fullPath, guid) {
  let t = String(xml || '');
  const re = new RegExp(`<Script><IsEnabled>(true|false)</IsEnabled><guid>[^<]*</guid><Name>${file.replace(/[.]/g, '\\.')}</Name>`);
  if (re.test(t)) return t.replace(re, (m) => m.replace(/<IsEnabled>false<\/IsEnabled>/, '<IsEnabled>true</IsEnabled>'));
  const el = `<Script><IsEnabled>true</IsEnabled><guid>${guid}</guid><Name>${file}</Name><Path>${fullPath}</Path></Script>`;
  if (/<ScriptsList>/.test(t)) return t.replace(/<ScriptsList>/, `<ScriptsList>${el}`);
  if (/<ScriptsList\s*\/>/.test(t)) return t.replace(/<ScriptsList\s*\/>/, `<ScriptsList>${el}</ScriptsList>`);
  return t.replace(/<\/Option>\s*$/, `  <ScriptsList>${el}</ScriptsList>\r\n</Option>\r\n`);
}

/** the manager's decision for one academy account.
 *  acc = swarm.config.json entry { login, character, academy }, st = Logs/academy_<character>.json (written by swarm.js) | null,
 *  cr = Logs/academy_create_<login>.json (written by the create script) | null, done = Logs/academy_manager.json accounts[login] | {}
 *  -> { act: 'setup' | 'rename' | 'next' | 'slotsfull' | 'wait' | 'none', name?, why } */
function academyDecide(acc, st, cr, done, cfg) {
  const C = academyCfg(cfg), D = done || {};
  if (!acc || !acc.academy || acc.enabled === false) return { act: 'none', why: 'not an academy account' };
  if (D.stopped) return { act: 'none', why: D.stopped };
  const ch = String(acc.character || '');
  if (cr && cr.result === 'fail' && cr.slotsFull) return { act: 'slotsfull', why: 'the account has no free character slot — academy loop stopped' };
  if (cr && cr.result === 'ok' && cr.name && cr.name !== ch && cr.forChar === ch) return { act: 'rename', name: cr.name, why: `the character was created as ${cr.name} (the first name was taken)` };
  if (D.setupFor !== ch) return { act: 'setup', why: `new academy character ${ch}: class plan, party plan, invite list, run switch` };
  if (st && st.status === 'graduated' && st.name === ch) {
    if (!C.end.newCharacter) return D.loggedOutFor === ch ? { act: 'none', why: `${ch} graduated and logged out` } : { act: 'logout', why: `${ch} graduated — logging out` };
    if ((Number(D.made) || 1) >= (Number(C.end.maxCharacters) || 7)) return { act: 'slotsfull', why: `${D.made || 1} academy characters made on this account (max ${C.end.maxCharacters})` };
    return { act: 'next', why: `${ch} graduated — the next academy character` };
  }
  return { act: 'wait', why: st && st.status ? `${ch}: ${st.status}${st.text ? ' — ' + st.text : ''}` : `${ch}: running` };
}

/** swarm.js / test: the academy funds -> wanted adena of one character (fund_rules chars target wins) */
function academyFundTarget(cfg, charTarget) {
  if (charTarget !== undefined && charTarget !== null && charTarget !== '' && isFinite(Number(charTarget))) return Number(charTarget);
  return Number(academyCfg(cfg).funds.target) || 0;
}

const API = { DEF, NAME_RE, academyCfg, academyName, academyNames, academyPlanSteps, academyPlan, createFailInfo, xmlSetSelected, xmlSelected, xmlEnsureScript, academyDecide, academyFundTarget };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AcademyLogic = API;
