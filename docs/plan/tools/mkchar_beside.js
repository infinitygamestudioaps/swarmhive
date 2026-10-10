// Builds an L2Swarm script that creates a NEW character on an account that already has characters (2026-10-07).
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// Why: L2Swarm selects an existing character by itself within ~0.4 s of the character list, and Send.NewCharacter/CharacterCreate
// sent from the game state are ignored by the server. What works (proven on mylogin21): RequestRestart (0x57) as raw hex, and the moment
// the character list (server 0x09) arrives — inside OnIncomingPacket, before L2Swarm's own selection — raw NewCharacter (0x13) +
// CharacterCreate (0x0C). Server answers: 0x0F CharCreateOk, 0x10 CharCreateFail (reason 2 = name taken -> next name candidate).
// Incoming packets carry a 2-byte length first: the opcode is p[2]. Result lines go to Logs/create_chars.txt ("RESULT OK <name>" / "RESULT FAIL").
// Usage (node): require('./mkchar_beside.js')(login, race, sex, classId, [STR,DEX,CON,INT,WIT,MEN], ['Name', 'Name2', ...]) -> script source
module.exports = function build(login, race, sex, cls, st, names) {
  const [STR, DEX, CON, INT, WIT, MEN] = st;
  return `(async () => {
  const L = ${JSON.stringify(login)}, NAMES = ${JSON.stringify(names)}, ARGS = [${race}, ${sex}, ${cls}, ${INT}, ${STR}, ${CON}, ${MEN}, ${DEX}, ${WIT}, 0, 0, 0];
  const log = (t) => { try { File.AppendAllText('${__ROOT}/Logs/create_chars.txt', new Date().toISOString() + ' [' + L + '] ' + t + '\\r\\n'); } catch (e) { } };
  const b = (n) => ('0' + (n & 255).toString(16)).slice(-2);
  const le = (n) => b(n) + b(n >> 8) + b(n >> 16) + b(n >> 24);
  const u16 = (s) => { let h = ''; for (const ch of s + '\\0') { const c = ch.charCodeAt(0); h += b(c) + b(c >> 8); } return h; };
  const createHex = (name) => '0c' + u16(name) + ARGS.map(le).join('');
  let i = 0, armed = false, result = null;
  try { Options.EnableJSOnIncomingPacket = true; } catch (e) { }
  globalThis.OnIncomingPacket = (p) => {
    try {
      const op = Number(p[2]) & 255;
      if (op === 0x09 && armed) { armed = false; Send.SendHex('13'); Send.SendHex(createHex(NAMES[i])); log('character list -> creating ' + NAMES[i]); }
      else if (op === 0x0f) { result = 'OK ' + NAMES[i]; }
      else if (op === 0x10) { const reason = Number(p[3]) & 255; result = 'FAIL ' + NAMES[i] + ' reason ' + reason; }
    } catch (e) { log('packet error ' + e); }
  };
  for (i = 0; i < NAMES.length; i++) {
    result = null; armed = true;
    Send.SendHex('57');
    for (let w = 0; w < 30 && !result; w++) await sleep(300);
    if (!result) { log('no answer for ' + NAMES[i]); continue; }
    log(result);
    if (result.startsWith('OK')) break;
    if (!/reason 2$/.test(result)) break;                      // anything but "name taken": stop (1 = too many characters)
    await sleep(3000);
  }
  try { Options.EnableJSOnIncomingPacket = false; } catch (e) { }
  log('RESULT ' + (result && result.startsWith('OK') ? result : 'FAIL ' + (result || 'no answer')));
})();`;
};
