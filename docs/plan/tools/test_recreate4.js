// RECREATE4-2026-11-03: replay of the live failure (graduate still on the account -> L2Swarm re-logs slot 1 after every RequestRestart; the
// create script's OnIncomingPacket never ran because Options.EnableJSOnIncomingPacket was never switched on). The generated create script runs
// in a vm against a fake L2Swarm + server that behave like the live ones:
//   - RequestRestart (0x57) -> the character list (0x09) is offered to OnIncomingPacket ONLY when Options.EnableJSOnIncomingPacket is true,
//   - then L2Swarm selects by itself: the script's own CharacterSelect (0x12 slot) if it sent one, else SelectedCharacter by name, else slot 0,
//   - CharacterCreate adds the new character (CharCreateOk 0x0f + a fresh list), CharacterDelete (0x0D) marks a pending deletion (still listed).
// Expect: with the fix the NEW character ends in game; the old code (no hook switch) stays in game as the graduate (the live symptom).
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '../../..');
const A = require(path.join(R, 'Dashboard', 'addaccount_api.js'));
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };

const u16 = (s) => { const a = []; for (let i = 0; i < s.length; i++) { const k = s.charCodeAt(i); a.push(k & 255, (k >> 8) & 255); } a.push(0, 0); return a; };
const le = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255];
function listBytes(login, chars) {
  let body = [0x09].concat(le(chars.length), le(7), [0]);
  chars.forEach((c, i) => { body = body.concat(u16(c.name), le(0x10000000 + i), u16(login), le(0), le(0), le(c.del ? 1 : 0)); });
  return [body.length & 255, (body.length >> 8) & 255].concat(body);
}

async function run({ fixed }) {
  const LOGIN = 'mylogin82', NEW = 'Nuker20', GRAD = 'Nyxara05';
  let src = A.buildCreateScript('C:/X', LOGIN, { stats: [10, 10, 10, 10, 10, 10], race: 2, sex: 1, classId: 38, names: [NEW], del: [GRAD], resultFile: 'Logs/res.json' }, NEW);
  if (!fixed) src = src.replace(/Options\.EnableJSOnIncomingPacket = true;/, '/* old code: never switched on */');
  let clock = 1793700000000; const logs = [], files = {};
  const S = { chars: [{ name: GRAD, del: false }], inGame: GRAD, scriptSelect: null };
  const ctx = {};
  const Options = { SelectedCharacter: NEW, AutoReconnect: true, EnableJSOnIncomingPacket: false };
  const offer = (bytes) => { if (Options.EnableJSOnIncomingPacket && typeof ctx.OnIncomingPacket === 'function') ctx.OnIncomingPacket(bytes); };
  const l2swarmSelects = () => {                 // ~0.4 s after the list: the script's select wins, else the configured name, else slot 0
    const L = S.chars; let slot = S.scriptSelect;
    if (slot === null) { const i = L.findIndex(c => c.name === Options.SelectedCharacter); slot = i >= 0 ? i : 0; }
    S.scriptSelect = null; S.inGame = L[slot] ? L[slot].name : '';
  };
  const Send = {
    SendHex(h) {
      h = String(h).toUpperCase();
      if (h === '57') { S.inGame = ''; offer(listBytes(LOGIN, S.chars)); l2swarmSelects(); return; }
      if (h.slice(0, 2) === '0D') { const slot = parseInt(h.slice(2, 4), 16); if (S.chars[slot]) S.chars[slot].del = true; offer([3, 0, 0x1d]); return; }
      if (h.slice(0, 2) === '12') { S.scriptSelect = parseInt(h.slice(2, 4), 16); return; }
      throw new Error('unexpected raw packet ' + h);
    },
    NewCharacter() { }, StopMove() { },
    CharacterCreate(name) { if (!S.chars.some(c => c.name === name)) S.chars.push({ name, del: false }); offer([3, 0, 0x0f]); offer(listBytes(LOGIN, S.chars)); },
    CharSelected(slot) { S.scriptSelect = slot; },
  };
  class FDate extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } }
  Object.assign(ctx, {
    Options, Send, Date: FDate, JSON, Math, String, Number, Array, Object, console: { log() { } },
    Me: { get Name() { return S.inGame; } },
    sleep: (ms) => { clock += ms; return Promise.resolve(); },
    File: { AppendAllText: (f, tx) => logs.push(String(tx).trim()), WriteAllText: (f, tx) => { files[f] = tx; } },
    StopCombat() { }, RunCommand() { }, IsCharacterReady: () => !!S.inGame,
  });
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  for (let i = 0; i < 4000 && !Object.keys(files).length; i++) await new Promise(r => setImmediate(r));
  for (let i = 0; i < 4000; i++) await new Promise(r => setImmediate(r));
  return { S, logs, files, Options };
}

(async () => {
  const good = await run({ fixed: true });
  t('fix: the new character ends in game (not the graduate)', good.S.inGame === 'Nuker20');
  t('fix: the graduate is marked for deletion at the list', good.S.chars.some(c => c.name === 'Nyxara05' && c.del));
  t('fix: the hook was switched on and the create happened inside the list', good.logs.some(l => /packet hook on/.test(l)) && good.logs.some(l => /CharacterCreate sent at the list: Nuker20/.test(l)));
  t('fix: the new character was selected by its slot at a later list', good.logs.some(l => /CharacterSelect sent at the list: Nuker20 \(slot 1\)/.test(l)));
  t('fix: RESULT OK in game, and EnableJSOnIncomingPacket back to its old value', good.logs.some(l => /RESULT OK Nuker20/.test(l)) && good.Options.EnableJSOnIncomingPacket === false && good.Options.AutoReconnect === true);
  const old = await run({ fixed: false });
  t('replay of the live failure: without the hook switch the graduate stays in game', old.S.inGame === 'Nyxara05' && !old.logs.some(l => /CharacterCreate sent at the list/.test(l)));
  const SRC = fs.readFileSync(path.join(R, 'Dashboard', 'addaccount_api.js'), 'utf8');
  t('source: RECREATE4 switches the packet hook on and restores it (jsBack in arBack)', SRC.includes('Options.EnableJSOnIncomingPacket = true;') && /const arBack = \(\) => \{[^\n]*jsBack\(\); \};/.test(SRC));
  console.log(`recreate4: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
