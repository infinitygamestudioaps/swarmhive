// PATCH NPC DIALOG, part 2 (DIALOG-2026-10-13; after patch_npc_dialog.js): the last direct "send a bypass, then sleep / poll" spots
// (epic link teleport, clan create, the !goto npc link) on the dialog engine. Anchored; nothing is written unless every anchor matches once.
//   node docs/plan/tools/patch_npc_dialog2.js <in swarm.js> [out]
'use strict';
const fs = require('fs');
const IN = process.argv[2], OUT = process.argv[3] || IN;
let s = fs.readFileSync(IN, 'utf8');
if (!s.includes('// DIALOG-PURE-BEGIN')) { console.error('run patch_npc_dialog.js first'); process.exit(1); }
if (s.includes('DIALOG2-2026-10-13')) { console.error('already patched (part 2)'); process.exit(1); }
const done = [];
function rep(name, find, repl) {
  const n = s.split(find).length - 1;
  if (n !== 1) { console.error(`ANCHOR ${name}: found ${n} times (want 1)`); process.exit(1); }
  s = s.replace(find, () => repl); done.push(name);
}
rep('epic link', `  const tp = waitTeleport(9000); Send.ReqBypassToServer(l.cmd, true); const ok = await tp;`,
  `  const ok = !!(await DLG.click(l, { expect: ['teleport'], base: 9000, from: N.name, reclick: true })).ok;   // DIALOG2-2026-10-13: CLICK -> WAIT_RESULT teleport`);
rep('clan create', `          Send.ReqBypassToServer(cmd, true);
          let got = '';
          for (let k = 0; k < 24 && !got; k++) { await sleep(400); if (lastSysMsg && lastSysMsg.at >= t0 && !seen.includes(lastSysMsg.text)) seen.push(lastSysMsg.text); got = myClanName(); }`,
  `          Send.ReqBypassToServer(cmd, true);
          let got = '';
          // DIALOG2-2026-10-13: ACT (the create bypass) -> WAIT_EFFECT: my clan name, or a refusal (adena / level ...) at once
          await DLG.effect({ check: () => { if (lastSysMsg && lastSysMsg.at >= t0 && !seen.includes(lastSysMsg.text)) seen.push(lastSysMsg.text); got = myClanName(); return !!got; }, base: 9600, label: \`\${nm}: create clan "\${name}"\` });`);
rep('npc trip link', `        Send.ReqBypassToServer(l.cmd, true); await sleep(1500);
      }
      npcTripSet({ result: 'talked' });`, `        await DLG.click(l, { expect: ['npc', 'quest', 'board', 'shop', 'whdep', 'whwd', 'multisell', 'teleport'], base: 1500, from: s.name });   // DIALOG2-2026-10-13: whatever the link opens (an action: never clicked twice)
      }
      npcTripSet({ result: 'talked' });`);
fs.writeFileSync(OUT, s);
console.log(`patched ${done.length} anchors -> ${OUT}`);
