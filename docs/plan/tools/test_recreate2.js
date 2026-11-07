// RECREATE2-2026-11-03 replay (live 15:29-15:33Z: "[mylogin82] in game as Nyxara05 - back to the character list (RequestRestart, try 8)" - L2Swarm
// re-logged the graduate within a second each time because the account's LIVE SelectedCharacter was still the graduate ("Account configuration
// is already loaded"); the manager also re-tried every ~2 min with a NEW name each time). Sandbox only: the generated create script runs in a vm
// with a fake host; the manager decisions are pure.
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '../../..');
const AA = require(path.join(R, 'Dashboard', 'addaccount_api.js')), AL = require(path.join(R, 'Dashboard', 'academy_logic.js'));
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };

// ---- 1) the create script against a fake L2Swarm that re-logs the graduate
const u16 = (s) => { const a = []; for (let i = 0; i < s.length; i++) { const k = s.charCodeAt(i); a.push(k & 255, (k >> 8) & 255); } a.push(0, 0); return a; };
const list = (login, names) => { const b = [0, 0, 0x09]; names.forEach(n => { b.push(...u16(n), 1, 2, 3, 4, ...u16(login)); }); return b; };
async function replay() {
  const src = AA.buildCreateScript('C:/sandbox', 'mylogin82', { race: 2, sex: 1, classId: 38, stats: [1, 2, 3, 4, 5, 6], names: ['Nuker20', 'Other12'], resultFile: '', del: ['Nyxara05'] }, 'Nuker20');
  const sent = [], logs = [], H = { name: 'Nyxara05' };
  const Options = { SelectedCharacter: 'Nyxara05', AutoReconnect: true };
  let tick = 0;
  const ctx = {
    Options, File: { AppendAllText: (f, s) => logs.push(String(s).trim()), WriteAllText: () => { } },
    Send: { SendHex: (h) => sent.push('hex:' + h), NewCharacter: () => sent.push('new'), CharacterCreate: (n) => sent.push('create:' + n), CharSelected: (s) => sent.push('sel:' + s) },
    sleep: () => new Promise(r => setImmediate(r)), console, Date, JSON, Math, Number, String, Array, Object, Promise, setImmediate
  };
  Object.defineProperty(ctx, 'Me', { get: () => (H.name ? { Name: H.name } : null) });
  ctx.globalThis = ctx; vm.createContext(ctx);
  const run = vm.runInContext(src, ctx);
  // the live sequence: in game as the graduate -> RequestRestart -> the list comes (L2Swarm would select at once) -> CharCreateOk
  for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
  const askedRestart = sent.some(s => s === 'hex:57'), arOffAtRestart = Options.AutoReconnect === false;
  H.name = '';                                                          // at the character list now
  ctx.OnIncomingPacket(list('mylogin82', ['Nyxara05']));                     // the list: the script must act INSIDE this packet
  const createdAtList = sent.includes('create:Nuker20'), delAtList = sent.some(s => /^hex:0D/.test(s));
  ctx.OnIncomingPacket([0, 0, 0x0f]);                                   // CharCreateOk
  const liveSel = Options.SelectedCharacter;
  for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
  const arBackAfterCreate = Options.AutoReconnect === true;            // L2Swarm may reconnect again = it logs the NEW one in
  H.name = 'Nuker20';                                                // L2Swarm enters with the live SelectedCharacter
  for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
  return { askedRestart, arOffAtRestart, arBackAfterCreate, createdAtList, delAtList, liveSel, logs, sent };
}

(async () => {
  const r = await replay();
  t('in game as the graduate -> RequestRestart back to the character list', r.askedRestart);
  t('RECREATE3: AutoReconnect is OFF for the restart (no full re-login with slot 1)', r.arOffAtRestart);
  t('RECREATE3: AutoReconnect is back ON after the create (L2Swarm logs the new character in)', r.arBackAfterCreate);
  { const S = AA.buildCreateScript('C:/x', 'mylogin82', { race: 2, sex: 1, classId: 38, stats: [1, 2, 3, 4, 5, 6], names: ['A12'], resultFile: '', del: [] }, 'A12');
    t('RECREATE3: max 8 restarts 45 s apart, and AutoReconnect restored on EVERY end (fail, timeout, script stop)', S.includes('if (rs >= 8) { arBack();') && S.includes('Date.now() - rsAt > 45000') && S.includes("arBack(); log('RESULT FAIL timeout');") && S.includes('globalThis.OnBeforeScriptStop = () => arBack();') && S.includes("{ arBack(); log('RESULT FAIL ' + CUR")); }
  t('the graduate is marked for deletion INSIDE the character-list packet (before L2Swarm can select)', r.delAtList);
  t('the new character is created INSIDE the character-list packet', r.createdAtList);
  t('after the create the LIVE SelectedCharacter names the new character (the next list enters with it)', r.liveSel === 'Nuker20');
  t('only the new name ends it: "RESULT OK Nuker20"', r.logs.some(l => /RESULT OK Nuker20/.test(l)));
  t('the script points the live option at the new name from the start', r.logs.some(l => /live SelectedCharacter -> Nuker20/.test(l)));

  // ---- 2) the manager: back-off, no stale force, keep the name
  const base = '2026-11-03T15:27:00.000Z', at = (min) => new Date(Date.parse(base) + min * 60000).toISOString();
  t('a retry 2 min after a try (retries 1) is NOT due (back-off 30 min)', AL.academyStuckCreate(null, null, { retries: 1, createAt: base }, 'X', at(2)) === null);
  t('a stale dashboard force OLDER than the last try is ignored (the live ~2-min loop)', AL.academyStuckCreate(null, null, { retries: 1, createAt: base, forceRetry: at(-1) }, 'X', at(2)) === null);
  t('a NEW dashboard force (after the last try) retries at once', !!AL.academyStuckCreate(null, null, { retries: 1, createAt: base, forceRetry: at(1) }, 'X', at(2)));
  t('the back-off doubles: due after 30 min at retries 1', !!AL.academyStuckCreate(null, null, { retries: 1, createAt: base }, 'X', at(31)));
  t('a re-try keeps the name (no create result / in-game failure)', AL.academyRetryName('Nuker20', null) === 'Nuker20' && AL.academyRetryName('Nuker20', { result: 'fail', forChar: 'Nuker20', reason: 'in game as Nyxara05' }) === 'Nuker20');
  t('a NEW name only when the server refused this name', AL.academyRetryName('Nuker20', { result: 'fail', forChar: 'Nuker20', reason: 2 }) === null);
  t('slots full is no name problem: the name is kept', AL.academyRetryName('Nuker20', { result: 'fail', forChar: 'Nuker20', slotsFull: true, reason: 1 }) === 'Nuker20');

  // ---- 3) source: the retry path does not rewrite the config while the name stays and the account is open
  const API = fs.readFileSync(path.join(R, 'Dashboard', 'academy_api.js'), 'utf8');
  t('retry: same name + attached script = no close / open (no swarm.config.json / brain_host.json rewrite)', API.includes("const keepName = AL.academyRetryName(String(acc.character), cr);") && API.includes("if (keepName && names[0] === String(acc.character) && xmlHasScript(ctx, acc.config, mk)) out = 'same name, the account stays open"));
  t('makeCreate puts the kept name first', API.includes('function makeCreate(ctx, acc, C, taken, del, keep) {') && API.includes('if (keep) names = [String(keep)].concat('));
  t('the dashboard force is a time (never a stale boolean)', API.includes("M.accounts[login].forceRetry = iso();"));
  console.log(`recreate2: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
