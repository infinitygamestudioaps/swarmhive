// PATCH NPC DIALOG (DIALOG-2026-10-13): moves every NPC / board / shop / warehouse / teleport dialog of swarm.js onto ONE event-driven state
// machine (the DIALOG-PURE block + its host glue). Anchored replaces: every anchor must match exactly once, else nothing is written.
//   node docs/plan/tools/patch_npc_dialog.js <in swarm.js> [out swarm.js]     (out defaults to in)
'use strict';
const fs = require('fs'), path = require('path');
const IN = process.argv[2], OUT = process.argv[3] || IN;
if (!IN) { console.error('usage: patch_npc_dialog.js <in> [out]'); process.exit(2); }
let s = fs.readFileSync(IN, 'utf8');
const BLOCK = fs.readFileSync(path.join(__dirname, 'npc_dialog_block.js'), 'utf8').trim();
if (s.includes('// DIALOG-PURE-BEGIN')) { console.error('already patched (DIALOG-PURE-BEGIN present)'); process.exit(1); }
const done = [];
function rep(name, find, repl) {
  const n = s.split(find).length - 1;
  if (n !== 1) { console.error(`ANCHOR ${name}: found ${n} times (want 1)`); process.exit(1); }
  s = s.replace(find, () => repl); done.push(name);
}

// ---------------------------------------------------------------- 1. the engine + host glue, the old single-slot waits on top of it
rep('waits', `function waitNpcHtml(ms) {
  return new Promise(resolve => {
    const done = (html) => { clearTimeout(t); resolve(html); };
    const t = setTimeout(() => { if (npcWaiter === done) npcWaiter = null; resolve(null); }, ms);
    npcWaiter = done;
  });
}

function waitTeleport(ms) {
  return new Promise(resolve => {
    const done = (ok) => { clearTimeout(t); resolve(ok); };
    const t = setTimeout(() => { if (teleportWaiter === done) teleportWaiter = null; resolve(false); }, ms);
    teleportWaiter = done;
  });
}
`, `// DIALOG-2026-10-13: the old single-slot waits are views of the dialog engine (adaptive safety net, sequence numbers, late duplicates held back,
// refusal system messages end them at once; several waits at a time). Set up BEFORE the click, like before.
function waitNpcHtml(ms) { return DLG.wait({ expect: DLG_PAGES, base: ms, label: 'a page' }).then(r => r.ok ? r.ev.data.html : null); }
function waitTeleport(ms) { return DLG.wait({ expect: ['teleport'], base: ms, label: 'the teleport' }).then(r => !!r.ok); }

${BLOCK}
// --- DIALOG host side (DIALOG-2026-10-13) ------------------------------------------------------------------------------------------------
/** the brain engine's view of my agent (Dashboard/brain_host/host.js __agentLink: ms since its last report + ping round trip); null inside L2Swarm */
function dlgAgentLag() { try { if (typeof __agentLink === 'function') { const a = __agentLink(); if (a) return { connected: a.connected !== false, age: num(a.age), rtt: num(a.rtt) }; } } catch (e) { } return null; }
function dlgLog(line) {
  const t = new Date().toISOString();
  try { appendShared(\`\${SWARM_ROOT}\\\\Logs\\\\dialog.log\`, \`\${t} \${Me.Name}: \${line}\\r\\n\`); } catch (e) { }
  try { appendShared(\`\${SWARM_ROOT}\\\\Logs\\\\intent_\${Me.Name}.log\`, \`\${t}   dialog: \${line}\\r\\n\`); } catch (e) { }
}
const DLG = dlgEngine({ now: () => now(), sleep: (ms) => sleep(ms), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t),
  lag: dlgAgentLag, target: () => { try { return Target ? num(Target.objId) : 0; } catch (e) { return 0; } },
  action: (id) => Send.Action(id), bypass: (cmd) => Send.ReqBypassToServer(cmd, true),
  links: (html, board) => board ? pageActions(String(html || '')).map(a => ({ cmd: a.cmd, text: a.label })) : npcLinks(String(html || '')),
  text: (html) => htmlText(String(html || '')), log: dlgLog });
/** CLICK + WAIT_RESULT for one link -> its page html | null (DLG.last says why). link = { cmd, text } | a bypass string.
 *  o.reclick: true only for links whose answer is certain (menus); never for an action (a confirm, a toggle, "give me ...") */
async function dlgPage(link, ms, from, o) {
  const L = typeof link === 'string' ? { cmd: link, text: link } : link;
  const r = await DLG.click(L, Object.assign({ base: ms, from: from ? String(from) : '' }, o || {}));
  return r.ok && r.html !== undefined ? r.html : null;
}
/** CLICK + WAIT_RESULT for a link that may teleport or answer with a page -> 'tp' | 'page' | null (DLG.last says why).
 *  o.thenTpMs: after a page, wait that long for a teleport too (the old "page first, the teleport after it" races) */
async function dlgTpOrPage(link, ms, from, o) {
  const L = typeof link === 'string' ? { cmd: link, text: link } : link, s0 = DLG.seq;
  const r = await DLG.click(L, Object.assign({ base: ms, from: from ? String(from) : '', expect: ['teleport', 'npc', 'quest'] }, o || {}));
  if (r.ok && r.kind !== 'teleport' && o && o.thenTpMs) { const t = await DLG.wait({ expect: ['teleport'], after: s0, base: o.thenTpMs, refuse: false, label: 'a teleport after the page' }); if (t.ok) return 'tp'; }
  return r.ok ? (r.kind === 'teleport' ? 'tp' : 'page') : null;
}
`);

// ---------------------------------------------------------------- 2. events -> the engine
rep('ev npc', `globalThis.OnNpcHtmlMessage = (html) => {
  lastNpcHtml = html; npcPageSeq++; npcPageAt = now(); npcPageKind = 'npc';
  try { File.WriteAllText(\`\${SWARM_ROOT}\\\\Logs\\\\npc_\${Me.Name}.html\`, html); } catch (e) { }
  if (npcWaiter) { const w = npcWaiter; npcWaiter = null; w(html); }
};`, `globalThis.OnNpcHtmlMessage = (html) => {
  lastNpcHtml = html; npcPageSeq++; npcPageAt = now(); npcPageKind = 'npc';
  try { File.WriteAllText(\`\${SWARM_ROOT}\\\\Logs\\\\npc_\${Me.Name}.html\`, html); } catch (e) { }
  try { DLG.ev('npc', { html: String(html || '') }); } catch (e) { }          // DIALOG-2026-10-13: the dialog engine takes every page
};`);
rep('ev quest', `globalThis.OnNpcQuestHtmlMessage = (html) => {
  lastNpcHtml = html; npcPageSeq++; npcPageAt = now(); npcPageKind = 'quest';
  try { File.WriteAllText(\`\${SWARM_ROOT}\\\\Logs\\\\npc_\${Me.Name}.html\`, html); } catch (e) { }
  if (npcWaiter) { const w = npcWaiter; npcWaiter = null; w(html); }
};`, `globalThis.OnNpcQuestHtmlMessage = (html) => {
  lastNpcHtml = html; npcPageSeq++; npcPageAt = now(); npcPageKind = 'quest';
  try { File.WriteAllText(\`\${SWARM_ROOT}\\\\Logs\\\\npc_\${Me.Name}.html\`, html); } catch (e) { }
  try { DLG.ev('quest', { html: String(html || '') }); } catch (e) { }        // DIALOG-2026-10-13
};`);
rep('ev board', `  if (bbsWaiter) { const w = bbsWaiter; bbsWaiter = null; w(html); }
};`, `  try { DLG.ev('board', { html: String(html || '') }); } catch (e) { }        // DIALOG-2026-10-13
};`);
rep('bbsRequest', `/** Send en bypass og vent på næste board-side (null ved timeout). */
function bbsRequest(cmd) {
  return new Promise(resolve => {
    const done = (html) => { clearTimeout(timer); resolve(html); };
    const timer = setTimeout(() => {
      if (bbsWaiter === done) bbsWaiter = null;
      resolve(null);
    }, CONFIG.buffs.pageTimeoutMs);
    bbsWaiter = done;
    Send.ReqBypassToServer(cmd, true);
  });
}`, `/** Send a bypass and take the next board page (null when none came: DLG.last says why). DIALOG-2026-10-13: the dialog engine (adaptive
 *  wait, one re-click only when the click was provably lost; action = an action button: never clicked twice) */
function bbsRequest(cmd, label, action) {
  return DLG.click({ cmd, text: label || cmd }, { expect: ['board'], base: CONFIG.buffs.pageTimeoutMs, from: 'the Community Board', reclick: !action }).then(r => r.ok ? r.html : null);
}`);
rep('bbsClick', `async function bbsClick(html, label) {
  const code = bbsButton(html, label);
  if (!code) throw new Error(\`button '\${label}' not found\`);
  return await bbsRequest(code);
}`, `async function bbsClick(html, label, action) {
  const code = bbsButton(html, label);
  if (!code) throw new Error(\`button '\${label}' not found\`);
  return await bbsRequest(code, label, action);
}`);
rep('bbs buff me', `  await bbsClick(schemePage, button);           // svaret (ny side) er ligegyldigt`, `  await bbsClick(schemePage, button, true);     // svaret (ny side) er ligegyldigt (an action: never clicked twice)`);
rep('ev teleport', `  if (teleportWaiter) { const w = teleportWaiter; teleportWaiter = null; w(true); }
  scheduleTownRestock();`, `  try { DLG.ev('teleport', { x, y, z }); } catch (e) { }                     // DIALOG-2026-10-13
  scheduleTownRestock();`);
rep('ev shop', `  if (shopWaiter) { const w = shopWaiter; shopWaiter = null; w({ shopId, items }); }
};`, `  try { DLG.ev('shop', { shopId, items }); } catch (e) { }                     // DIALOG-2026-10-13
};`);
rep('waitShop', `function waitShop(ms) {
  return new Promise(resolve => {
    const done = (s) => { clearTimeout(t); resolve(s); };
    const t = setTimeout(() => { if (shopWaiter === done) shopWaiter = null; resolve(null); }, ms);
    shopWaiter = done;
  });
}`, `function waitShop(ms) { return DLG.wait({ expect: ['shop'], base: ms, label: 'the shop list' }).then(r => r.ok ? { shopId: r.ev.data.shopId, items: r.ev.data.items } : null); }   // DIALOG-2026-10-13`);
rep('ev whdep', `globalThis.OnWareHouseDepositList = (items) => { try { wh.depositItems = items; if (wh.waiter) { const w = wh.waiter; wh.waiter = null; w({ kind: 'deposit', items }); } } catch (e) { } };`,
  `globalThis.OnWareHouseDepositList = (items) => { try { wh.depositItems = items; DLG.ev('whdep', { items }); } catch (e) { } };   // DIALOG-2026-10-13`);
rep('ev whwd', `    if (wh.waiter) { const w = wh.waiter; wh.waiter = null; w({ kind: 'withdraw', items, rows }); }
  } catch (e) { logError('OnWareHouseWithdrawalList', e); }`, `    DLG.ev('whwd', { items, rows });                                          // DIALOG-2026-10-13
  } catch (e) { logError('OnWareHouseWithdrawalList', e); }`);
rep('waitWarehouse', `function waitWarehouse(ms) { return new Promise(res => { wh.waiter = res; setTimeout(() => { if (wh.waiter === res) { wh.waiter = null; res(null); } }, ms); }); }`,
  `function waitWarehouse(ms) { return DLG.wait({ expect: ['whdep', 'whwd'], base: ms, label: 'the warehouse list' }).then(r => r.ok ? { kind: r.kind === 'whdep' ? 'deposit' : 'withdraw', items: r.ev.data.items, rows: r.ev.data.rows } : null); }   // DIALOG-2026-10-13
/** CLICK a warehouse keeper link + WAIT_RESULT: -> { kind: 'deposit' | 'withdraw', items, rows } | { page } | null (refused / nothing: DLG.last) */
async function dlgWhClick(link, ms, from) {
  const r = await DLG.click(link, { expect: ['whdep', 'whwd', 'npc', 'quest'], base: ms, from: from ? String(from) : '', reclick: true });
  if (!r.ok) return null;
  if (r.kind === 'whdep' || r.kind === 'whwd') return { kind: r.kind === 'whdep' ? 'deposit' : 'withdraw', items: r.ev.data.items, rows: r.ev.data.rows };
  return { page: r.html };
}`);
rep('ev sys', `    try { sysMsgRing.push(lastSysMsg); if (sysMsgRing.length > 40) sysMsgRing.shift(); } catch (e) { }   // QSYS-2026-10-13`,
  `    try { sysMsgRing.push(lastSysMsg); if (sysMsgRing.length > 40) sysMsgRing.shift(); } catch (e) { }   // QSYS-2026-10-13
    try { DLG.ev('sys', { id: Number(id), text: lastSysMsg.text }); } catch (e) { }   // DIALOG-2026-10-13: a refusal ends the dialog wait at once`);
rep('ev packet', `    try { if (hennaPkt.want && (Number(p[2]) & 255) === hennaPkt.want) { const w = hennaPkt.waiter; hennaPkt.want = 0; hennaPkt.waiter = null; if (w) w(p); } } catch (e) { }`,
  `    try { const op = Number(p[2]) & 255; if (hennaPkt.want && op === hennaPkt.want) { hennaPkt.want = 0; DLG.ev('packet', { op, p }); } } catch (e) { }   // DIALOG-2026-10-13`);
rep('waitHennaPacket', `function waitHennaPacket(op, ms) {
  hennaHook();
  return new Promise(res => {
    const fin = (p) => { clearTimeout(t); res(p); };
    const t = setTimeout(() => { if (hennaPkt.waiter === fin) { hennaPkt.want = 0; hennaPkt.waiter = null; } res(null); }, ms);
    hennaPkt.want = op; hennaPkt.waiter = fin;
    try { Options.EnableJSOnIncomingPacket = true; } catch (e) { }
  });
}`, `function waitHennaPacket(op, ms) {
  hennaHook(); hennaPkt.want = op;
  try { Options.EnableJSOnIncomingPacket = true; } catch (e) { }
  return DLG.wait({ expect: ['packet'], base: ms, match: (ev) => ev.data.op === op, label: 'server packet 0x' + op.toString(16) })   // DIALOG-2026-10-13
    .then(r => { if (hennaPkt.want === op) hennaPkt.want = 0; return r.ok ? r.ev.data.p : null; });
}`);

// ---------------------------------------------------------------- 3. OPEN: openNpc
rep('openNpc', `  // står vi stadig langt væk: klikket får serveren til at gå hen (virker inden for synsvidde)
  for (let i = 0; i < 3; i++) {
    const page = waitNpcHtml(g.pageTimeoutMs);
    Send.Action(npc.objId);                     // vælg
    await sleep(300);
    Send.Action(npc.objId);                     // tal
    const html = await page;
    if (html) { await sleep(900); intentDone('npc', true, \`\${npc.Name} answered\`); return lastNpcHtml || html; }   // dobbelt-klik giver siden 2 gange: brug den nyeste
    if (i === 1) {                              // svarer ikke: sandsynligvis mur/disk imellem — lad L2Swarm finde vejen`, `  // står vi stadig langt væk: klikket får serveren til at gå hen (virker inden for synsvidde)
  // DIALOG-2026-10-13: OPEN + WAIT_PAGE in the dialog engine: an NPC that is my target already gets ONE click (both clicks of a double click
  // brought the page = a late 2nd copy), else select + talk; the wait follows the measured latency, re-clicks once only when the click was
  // provably lost; the 2nd try walks around (below), the 3rd clicks again
  const opened = await DLG.open(npc, { base: g.pageTimeoutMs, tries: 3, onNoAnswer: async (i) => {
    if (i === 1) {                              // svarer ikke: sandsynligvis mur/disk imellem — lad L2Swarm finde vejen`);
rep('openNpc tail', `        } catch (e) { fin(); } setTimeout(fin, 30000); });
      await sleep(500);
    }
  }
  intentDone('npc', false, \`\${npc.Name} did not answer 3 clicks (\${Math.round(Distance(npc))} away)\`);
  return null;
}`, `        } catch (e) { fin(); } setTimeout(fin, 30000); });
      await sleep(500);
    }
  } });
  if (opened && opened.ok) { intentDone('npc', true, \`\${npc.Name} answered\`); return opened.html; }
  intentDone('npc', false, \`\${npc.Name} did not answer\${opened && opened.sys ? ': ' + opened.sys.why : ' 3 clicks'} (\${Math.round(Distance(npc))} away)\`);
  return null;
}`);

// ---------------------------------------------------------------- 4. gatekeeper: a flow (menus -> the destination link -> the teleport)
rep('gk flow', `    let cmd = wanted.cmd || null;
    if (!cmd) {
      const want = gkNorm(wanted.text);                // "Kamael Village free" == "Kamael Village"
      const matches = wanted.exact ? (t => gkNorm(t) === want) : (t => gkNorm(t).includes(want));
      const seen = new Set();
      for (let depth = 0; depth < 4 && !cmd && html; depth++) {
        const links = npcLinks(html);
        // fallback: the menu text is the END of what we want ('Alligator Island' for 'Entrance to Alligator Islands', Heine 2026-10-05) — only
        // multi-word, non-town links, and only when nothing matched the normal way
        const tail = (t) => { const n = gkNorm(t); return !wanted.exact && n.length >= 8 && n.includes(' ') && want.endsWith(n) && !townKeyFor(t); };
        const hit = links.find(l => matches(l.text)) || links.find(l => tail(l.text));
        if (hit) { cmd = hit.cmd; break; }
        // Ikke på denne side: prøv en teleport-/by-menu vi ikke har set.
        // Kun rene menu-links (ALDRIG et rejsemål — 'X Village' teleporterer!)
        const menu = links.find(l => /^(teleport|other|more|next|go to|see more|move to other)/i.test(l.text) && !/\\b(village|town|castle|camp|ruins|valley|forest|island|fortress|harbor|port|plateau|grounds|field)\\b/i.test(l.text) && !seen.has(l.cmd));
        if (!menu) break;
        seen.add(menu.cmd);
        const p = waitNpcHtml(g.pageTimeoutMs);
        Send.ReqBypassToServer(menu.cmd, true);
        html = await p;
        if (html) recordGkMenu(npc, html);
      }
      if (!cmd) {
        const menu = npcLinks(html || '').map(l => l.text).join(' | ');
        gkFail = \`no link to '\${gkNorm(wanted.text)}' at \${npc.Name}\${currentTownKey() ? ' (' + currentTownKey() + ')' : ''} — its menu: \${menu}\`;
        note(\`gatekeeper: \${gkFail}\`, true);
        return false;
      }
    }

    const tp = waitTeleport(g.teleportTimeoutMs);
    Send.ReqBypassToServer(cmd, true);
    let ok = await tp;`, `    // DIALOG-2026-10-13: the gatekeeper FLOW in the dialog engine — PICK the destination on this page (else a pure menu link, page by page,
    // each page recorded), CLICK it, WAIT_RESULT = the teleport (a page or a refusal instead ends it with the reason)
    let tr = null, cmd = wanted.cmd || null;
    if (!cmd) {
      const want = gkNorm(wanted.text);                // "Kamael Village free" == "Kamael Village"
      const matches = wanted.exact ? (t => gkNorm(t) === want) : (t => gkNorm(t).includes(want));
      // fallback: the menu text is the END of what we want ('Alligator Island' for 'Entrance to Alligator Islands', Heine 2026-10-05) — only
      // multi-word, non-town links, and only when nothing matched the normal way
      const tail = (t) => { const n = gkNorm(t); return !wanted.exact && n.length >= 8 && n.includes(' ') && want.endsWith(n) && !townKeyFor(t); };
      // Ikke på denne side: prøv en teleport-/by-menu vi ikke har set. Kun rene menu-links (ALDRIG et rejsemål — 'X Village' teleporterer!)
      const menuRe = (l) => /^(teleport|other|more|next|go to|see more|move to other)/i.test(l.text) && !/\\b(village|town|castle|camp|ruins|valley|forest|island|fortress|harbor|port|plateau|grounds|field)\\b/i.test(l.text);
      const fr = await DLG.run({ name: 'gatekeeper', steps: [{ label: \`the link to '\${gkNorm(wanted.text)}'\`, pick: { fn: (L) => L.find(l => matches(l.text)) || L.find(l => tail(l.text)) },
        menu: { fn: (L) => L.find(menuRe) }, expect: ['teleport'], until: ['teleport'], depth: 4, base: g.teleportTimeoutMs, menuBase: g.pageTimeoutMs, reclick: true,
        onPage: (ctx, h) => { recordGkMenu(npc, h); } }] }, { npc, page: html });
      if (!fr.ok && fr.links) {
        gkFail = \`no link to '\${gkNorm(wanted.text)}' at \${npc.Name}\${currentTownKey() ? ' (' + currentTownKey() + ')' : ''} — its menu: \${fr.links.map(l => l.text).join(' | ')}\`;
        note(\`gatekeeper: \${gkFail}\`, true);
        return false;
      }
      if (!fr.ok && fr.via === 'menu') { gkFail = \`\${npc.Name}: a menu page did not come (\${fr.why})\`; note(\`gatekeeper: \${gkFail}\`, true); return false; }
      tr = fr.ok ? fr.result : (fr.result || { ok: false, why: fr.why, sys: fr.sys });
      cmd = fr.ctx && fr.ctx.lastLink ? fr.ctx.lastLink.cmd : '?';
    } else tr = await DLG.click({ cmd, text: wanted.text || cmd }, { expect: ['teleport'], base: g.teleportTimeoutMs, from: npc.Name, reclick: true });
    let ok = !!(tr && tr.ok && tr.kind === 'teleport');`);
rep('gk fail text', `      gkFail = \`clicked '\${wanted.text || cmd}' at \${npc.Name} but no teleport within \${Math.round(g.teleportTimeoutMs / 1000)} s — \` +
        \`adena \${itemCount(57).toLocaleString()}, level \${Me.Level}\${lastSysMsg && now() - lastSysMsg.at < 15000 ? ', server said: ' + lastSysMsg.text : ''}\`;`,
  `      gkFail = \`clicked '\${wanted.text || cmd}' at \${npc.Name} but no teleport (\${tr && tr.sys ? 'REFUSED: ' + tr.sys.why : (tr && tr.why) || 'no answer'}) — \` +
        \`adena \${itemCount(57).toLocaleString()}, level \${Me.Level}\${lastSysMsg && now() - lastSysMsg.at < 15000 ? ', server said: ' + lastSysMsg.text : ''}\`;`);

// ---------------------------------------------------------------- 5. shops
rep('scanClick', `    const s = waitShop(6000), p = waitNpcHtml(6000);
    Send.ReqBypassToServer(l.cmd, true);
    // whichever comes first: a shop window (OnShopList) or a new dialog page (both give up after 6 s)
    const first = await Promise.race([s.then(x => ({ shop: x })), p.then(h => ({ html: h }))]);
    const sh = first.shop || null;
    if (!sh && first.html === undefined) html = await p;
    if (sh) {`, `    // DIALOG-2026-10-13: whichever comes first, a shop window (OnShopList) or a new dialog page — one wait in the dialog engine
    const ans = await DLG.click(l, { expect: ['shop', 'npc', 'quest'], base: 6000, from: npc.Name, reclick: true });
    const sh = ans.ok && ans.kind === 'shop' ? { shopId: ans.ev.data.shopId, items: ans.ev.data.items } : null;
    const first = { html: ans.ok && !sh ? ans.html : null };
    if (sh) {`);
rep('scanClick late', `    if (first.html !== undefined) html = first.html;
    if (!html) { const late = await Promise.race([s, sleep(1500).then(() => null)]); if (late) { await sleep(1200); const items = []; try { BuyList.forEach(it => items.push({ id: num(it.Id), name: String(it.Name || ''), price: num(it.Price) })); } catch (e) { } if (!keepOpen) { try { Send.RequestBuySellUIClose(); } catch (e) { } } return { shopId: late.shopId, items }; } }`,
  `    html = first.html;                                // (the old "late shop list" wait: the dialog engine waited adaptively already)`);
rep('openShop', `  // Find "Buy" (evt. i en undermenu) og vent på butikslisten.
  let shop = null;
  const tried = new Set();
  for (let depth = 0; depth < 3 && !shop && html; depth++) {
    const links = npcLinks(html).filter(l => !tried.has(l.cmd));
    const buy = links.find(l => /^buy/i.test(l.text)) || links.find(l => r.buyLinkMatch.test(l.text) && !/^sell/i.test(l.text));
    if (!buy) return { ok: false, msg: \`no buy link at \${npc.Name}: \` + links.map(l => l.text).join(' | ') };
    tried.add(buy.cmd);
    const s = waitShop(r.shopTimeoutMs);
    const p = waitNpcHtml(r.shopTimeoutMs);
    Send.ReqBypassToServer(buy.cmd, true);
    shop = await s;
    if (!shop) html = await p;                   // en ny side i stedet for butikken
  }
  if (!shop) return { ok: false, msg: \`the shop at \${npc.Name} did not open\` };`, `  // Find "Buy" (evt. i en undermenu) og vent på butikslisten. DIALOG-2026-10-13: the 'shop' FLOW (PICK "Buy" -> WAIT_RESULT shop list | a sub page)
  const fr = await DLG.run(dlgListFlow({ name: 'shop', label: 'the Buy link', until: ['shop'], ms: r.shopTimeoutMs, depth: 3,
    pick: { fn: (L) => L.find(l => /^buy/i.test(l.text)) || L.find(l => r.buyLinkMatch.test(l.text) && !/^sell/i.test(l.text)) } }), { npc, page: html });
  if (!fr.ok && fr.links) return { ok: false, msg: \`no buy link at \${npc.Name}: \` + fr.links.map(l => l.text).join(' | ') };
  if (!fr.ok) return { ok: false, msg: \`the shop at \${npc.Name} did not open\${fr.sys ? ' — ' + fr.sys.why : ''}\` };
  const shop = { shopId: fr.result.ev.data.shopId, items: fr.result.ev.data.items };`);
rep('openShop buylistwait', `  { const t0 = now(); await sleep(600);
    const same = openShop.lastNpc === String(npc.Name) && openShop.lastSig && openShop.lastSig === sig0;   // the same merchant again (one item per opening)
    while (now() - t0 < 8000) { const sg = blSig(); if (sg && (sg !== sig0 || same)) break; await sleep(300); }
    await sleep(300); openShop.lastNpc = String(npc.Name); openShop.lastSig = blSig(); }`, `  { await sleep(600);
    const same = openShop.lastNpc === String(npc.Name) && openShop.lastSig && openShop.lastSig === sig0;   // the same merchant again (one item per opening)
    await DLG.effect({ check: () => { const sg = blSig(); return !!sg && (sg !== sig0 || same); }, base: 7400, refuse: false, label: \`\${npc.Name}: the buy list\` });   // DIALOG-2026-10-13 (WAIT_EFFECT)
    await sleep(300); openShop.lastNpc = String(npc.Name); openShop.lastSig = blSig(); }`);
rep('buyAt BuyItem', `    try { res = BuyItem(w.id, count); } catch (e) { res = \`error: \${e.message}\`; }
    await sleep(1500);
    // fallback: the High Five buy packet RequestBuyItem 0x40 [shopId][n][itemId, count(8)] via Send.SendHex (no spaces) — tested 2026-10-03
    if (itemCount(w.id) === before && sh.shopId !== undefined && sh.shopId !== null) {
      try { buyPacket(sh.shopId, [{ id: w.id, count }]); res = 'buy packet'; } catch (e) { res = \`buy packet error: \${e.message}\`; }
      await sleep(1500);
    }`, `    try { res = BuyItem(w.id, count); } catch (e) { res = \`error: \${e.message}\`; }
    // DIALOG-2026-10-13: ACT -> WAIT_EFFECT (the bag count) or the server's refusal (adena / bag), adaptive instead of a fixed 1.5 s
    const gotIt = () => itemCount(w.id) !== before;
    let ef = await DLG.effect({ check: gotIt, base: 1500, label: \`\${npc.Name}: buy \${w.name} x\${count}\` });
    // fallback: the High Five buy packet RequestBuyItem 0x40 [shopId][n][itemId, count(8)] via Send.SendHex (no spaces) — tested 2026-10-03
    if (itemCount(w.id) === before && !(ef.sys && /^(adena|bag)$/.test(ef.sys.key)) && sh.shopId !== undefined && sh.shopId !== null) {
      try { buyPacket(sh.shopId, [{ id: w.id, count }]); res = 'buy packet'; } catch (e) { res = \`buy packet error: \${e.message}\`; }
      ef = await DLG.effect({ check: gotIt, base: 1500, label: \`\${npc.Name}: buy packet \${w.name} x\${count}\` });
    }
    if (ef.sys && itemCount(w.id) === before) res = \`REFUSED: \${ef.sys.why}\`;`);
rep('buyAt halving', `      try { buyPacket(sh.shopId, [{ id: w.id, count: c2 }]); res = \`buy packet x\${c2}\`; } catch (e) { res = \`buy packet error: \${e.message}\`; }
      await sleep(1500); got = itemCount(w.id) - before;`, `      try { buyPacket(sh.shopId, [{ id: w.id, count: c2 }]); res = \`buy packet x\${c2}\`; } catch (e) { res = \`buy packet error: \${e.message}\`; }
      await DLG.effect({ check: () => itemCount(w.id) !== before, base: 1500, label: \`\${npc.Name}: buy packet \${w.name} x\${c2}\` }); got = itemCount(w.id) - before;   // DIALOG-2026-10-13`);
rep('sellAt pass', `      await sleep(1500); await bagSync();                              // ENGINE DATA #15
      let left = 0; try { Inventory.forEach(i => { if (want.has(num(i.Id)) && !i.IsEquiped && !i.IsQuestItem && objOk(num(i.Id), i.objId)) left++; }); } catch (e) { }`,
  `      const leftNow = () => { let n = 0; try { Inventory.forEach(i => { if (want.has(num(i.Id)) && !i.IsEquiped && !i.IsQuestItem && objOk(num(i.Id), i.objId)) n++; }); } catch (e) { } return n; };
      await DLG.effect({ check: async () => { await bagSync(); return leftNow() < before; }, base: 1500, label: \`\${npc.Name}: sale pass \${pass + 1} (\${before} entries)\` });   // DIALOG-2026-10-13 WAIT_EFFECT (ENGINE DATA #15: bagSync)
      await bagSync();
      const left = leftNow();`);
rep('sellAt guard', `      for (let w = 0; w < 12; w++) { if (itemCount(57) !== before || list.reduce((a, it) => a + itemCount(it.id), 0) !== sumHad) break; await sleep(500); await bagSync(); } }`,
  `      await DLG.effect({ check: async () => { await bagSync(); return itemCount(57) !== before || list.reduce((a, it) => a + itemCount(it.id), 0) !== sumHad; }, base: 6000, refuse: false, label: \`\${npc.Name}: sale result\` }); }   // DIALOG-2026-10-13`);

// ---------------------------------------------------------------- 6. dyes
rep('dye draw', `    const pk = waitHennaPacket(0xEE, 6000);
    Send.ReqBypassToServer(link.cmd, true);
    const p = await pk; hennaHookOff();`, `    hennaHook(); hennaPkt.want = 0xEE; try { Options.EnableJSOnIncomingPacket = true; } catch (er) { }   // DIALOG-2026-10-13: CLICK "Draw" -> WAIT_RESULT HennaEquipList (0xEE)
    const dr = await DLG.click(link, { expect: ['packet'], match: (ev) => ev.data.op === 0xEE, base: 6000, from: npc.Name, reclick: true });
    if (hennaPkt.want === 0xEE) hennaPkt.want = 0;
    const p = dr.ok ? dr.ev.data.p : null; hennaHookOff();`);
rep('dye act', `    Send.SendHex('6F' + leHex(num(e.symbolId), 4));
    await sleep(2500);`, `    Send.SendHex('6F' + leHex(num(e.symbolId), 4));
    await DLG.effect({ check: () => bagCount(e.dyeId) <= d0 - need || (hennaStats() !== st0 && hennaStats() !== ''), base: 2500, label: \`\${npc.Name}: draw \${e.name}\` });   // DIALOG-2026-10-13 WAIT_EFFECT`);

// ---------------------------------------------------------------- 7. warehouses (deposit list, withdraw list, the clan list)
rep('openWarehouse', `    wh.want = kind;
    const w = waitWarehouse(6000), pg = waitNpcHtml(6000);
    Send.ReqBypassToServer(link.cmd, true);
    const r = await Promise.race([w, pg.then(h => h ? { page: h } : null)]);
    if (r && r.kind) return { ok: true, list: r };
    html = r && r.page ? r.page : lastNpcHtml;    // a sub menu ("Clan warehouse" -> "Withdraw"): next round`, `    wh.want = kind;
    const r = await dlgWhClick(link, 6000, npc.Name);   // DIALOG-2026-10-13: CLICK -> WAIT_RESULT (a warehouse list | a sub page | a refusal)
    if (r && r.kind) return { ok: true, list: r };
    if (!r && DLG.last && DLG.last.sys) return { ok: false, msg: \`\${npc.Name}: \${DLG.last.sys.why}\` };
    html = r && r.page ? r.page : null;           // a sub menu ("Clan warehouse" -> "Withdraw"): next round`);
rep('stashOpenList', `  const tried = {}; let lastLinks = [];
  for (let depth = 0; depth < 3 && html; depth++) {
    const links = npcLinks(html).filter(l => !tried[l.cmd + '|' + l.text]); lastLinks = links;   // PATCH_NEWENGINE2: codes are renumbered per page
    const pick = stashPickLink(links, kind);
    if (!pick) break;
    tried[pick.cmd + '|' + pick.text] = 1;
    wh.want = kind === 'clan' ? 'clandeposit' : 'deposit';
    const w = waitWarehouse(CONFIG.stash.listTimeoutMs), pg = waitNpcHtml(CONFIG.stash.listTimeoutMs);
    Send.ReqBypassToServer(pick.cmd, true);
    const r = await Promise.race([w, pg.then(h => h ? { page: h } : null)]);
    if (r && r.kind === 'deposit') return { ok: true, items: r.items, link: pick.text };
    if (r && r.kind) return { ok: false, msg: \`'\${pick.text}' opened a \${r.kind} list, not the deposit list\` };
    html = r && r.page ? r.page : null;
    if (html) savePage(\`stash_npc\${depth + 1}\`, html);
  }`, `  // DIALOG-2026-10-13: the 'deposit list' FLOW (PICK the deposit link, page by page; the codes are renumbered per page -> picked by text)
  wh.want = kind === 'clan' ? 'clandeposit' : 'deposit';
  const fr = await DLG.run(dlgListFlow({ name: 'stash', label: \`the \${kind} deposit link\`, until: ['whdep', 'whwd'], ms: CONFIG.stash.listTimeoutMs, depth: 3,
    pick: { fn: (L) => stashPickLink(L, kind) }, onPage: (h, round) => savePage(\`stash_npc\${round}\`, h) }), { npc, page: html });
  const lastLinks = fr.links || [];
  if (fr.ok && fr.result.kind === 'whdep') return { ok: true, items: fr.result.ev.data.items, link: fr.ctx.lastLink.text };
  if (fr.ok) return { ok: false, msg: \`'\${fr.ctx.lastLink.text}' opened a withdraw list, not the deposit list\` };
  if (fr.sys) return { ok: false, msg: fr.sys.key === 'clanwh' ? \`no clan warehouse right: the clan leader must tick "Warehouse Search" for my clan rank (Alt+N -> Privileges) — server: \${fr.sys.text}\` : \`\${npc.Name}: \${fr.sys.why} (server: \${fr.sys.text})\` };`);
rep('stash settle', `    await sleep(S.settleMs);
    { const tEnd = now() + Math.max(0, (S.settleMaxMs || 0) - S.settleMs); while (now() < tEnd && !stashLeft(batch, before, stashBag()).length && !(lastSysMsg && lastSysMsg.at >= t0 && stashSysVerdict(lastSysMsg.id))) await sleep(500); }   // STORAGE-2026-10-13: wait for the bag update`,
  `    // DIALOG-2026-10-13: ACT (the deposit packet) -> WAIT_EFFECT: the bag update or the server's verdict (STORAGE-2026-10-13: settleMaxMs = the old upper limit)
    await DLG.effect({ check: () => stashLeft(batch, before, stashBag()).length > 0 || !!(lastSysMsg && lastSysMsg.at >= t0 && stashSysVerdict(lastSysMsg.id)), base: S.settleMs, capMs: Math.max(S.settleMs, S.settleMaxMs || S.settleMs), refuse: false, label: \`\${npc.Name}: deposit of \${batch.length}\` });`);
rep('whOpenWithdraw', `  const tried = {}; let lastLinks = [];
  for (let depth = 0; depth < 3 && html; depth++) {
    const links = npcLinks(html).filter(l => !tried[l.cmd + '|' + l.text]); lastLinks = links;   // PATCH_NEWENGINE2: codes are renumbered per page
    const pick = whPickWithdrawLink(links, kind);
    if (!pick) break;
    tried[pick.cmd + '|' + pick.text] = 1;
    wh.want = kind === 'clan' ? 'clan' : 'private';
    const w = waitWarehouse(WH.listTimeoutMs), pg = waitNpcHtml(WH.listTimeoutMs);
    Send.ReqBypassToServer(pick.cmd, true);
    const r = await Promise.race([w, pg.then(h => h ? { page: h } : null)]);
    if (r && r.kind === 'withdraw') return { ok: true, rows: r.rows || [], items: r.items, link: pick.text };
    if (r && r.kind) return { ok: false, msg: "'" + pick.text + "' opened a " + r.kind + ' list, not the withdraw list' };
    html = r && r.page ? r.page : null;
    if (html) savePage('whtake_npc' + (depth + 1), html);
  }`, `  // DIALOG-2026-10-13: the 'withdraw list' FLOW (PICK the withdraw link, page by page) in the dialog engine
  wh.want = kind === 'clan' ? 'clan' : 'private';
  const fr = await DLG.run(dlgListFlow({ name: 'whtake', label: 'the ' + kind + ' withdraw link', until: ['whdep', 'whwd'], ms: WH.listTimeoutMs, depth: 3,
    pick: { fn: (L) => whPickWithdrawLink(L, kind) }, onPage: (h, round) => savePage('whtake_npc' + round, h) }), { npc, page: html });
  const lastLinks = fr.links || [];
  if (fr.ok && fr.result.kind === 'whwd') return { ok: true, rows: fr.result.ev.data.rows || [], items: fr.result.ev.data.items, link: fr.ctx.lastLink.text };
  if (fr.ok) return { ok: false, msg: "'" + fr.ctx.lastLink.text + "' opened a deposit list, not the withdraw list" };
  if (fr.sys) return { ok: false, msg: fr.sys.key === 'clanwh' ? 'no clan warehouse right (server: ' + fr.sys.text + ')' : npc.Name + ': ' + fr.sys.why + ' (server: ' + fr.sys.text + ')' };`);

rep('stash raw', `    const w = waitWarehouse(CONFIG.stash.listTimeoutMs);
    Send.ReqBypassToServer(\`npc_\${num(npc.objId)}_Deposit\${kind === 'clan' ? 'C' : 'P'}\`, true);
    const r = await w;`, `    const r = await dlgWhClick({ cmd: \`npc_\${num(npc.objId)}_Deposit\${kind === 'clan' ? 'C' : 'P'}\`, text: 'raw bypass Deposit' }, CONFIG.stash.listTimeoutMs, npc.Name);   // DIALOG-2026-10-13`);

// ---------------------------------------------------------------- 8. quests (the quest engine + the old quest legs)
rep('qeDialog open', `  const seqA = npcPageSeq; let wasTarget = false; try { wasTarget = !!(Target && num(Target.objId) === num(ref.objId)); } catch (e) { }
  let html = await openNpc(ref);
  if (!html) return { ok: false, msg: ref.Name + ' did not answer' };
  { const want = qePagesExpected(wasTarget), t0 = now(); while (npcPageSeq - seqA < want && now() - t0 < 6000) await sleep(250); if (npcPageSeq - seqA >= 1) { await sleep(300); html = lastNpcHtml || html; } }`,
  `  // DIALOG-2026-10-13: the dialog engine clicks a targeted NPC ONCE and holds a late 2nd copy back (never taken as the answer of "Quest")
  let html = await openNpc(ref);
  if (!html) return { ok: false, msg: ref.Name + ' did not answer' };`);
rep('qeDialog click', `    const seq0 = npcPageSeq, t0 = now(); Send.ReqBypassToServer(p.link.cmd, true);
    const ans = await qeWaitAnswer(seq0, t0, 15000); clicks++;
    if (ans.sys.kind) return qeSysRefusal(q, ref, p.link, ans.sys, { clicks, hit, text });
    html = ans.html;`, `    // DIALOG-2026-10-13: CLICK -> WAIT_RESULT in the dialog engine (a NEW page; the server's refusal ends it at once — QSYS)
    const t0 = now(); const cr = await DLG.click(p.link, { expect: DLG_PAGES, base: 15000, from: ref.Name, label: \`quest \${q.id} "\${p.link.text}"\` }); clicks++;
    const ans = { html: cr.ok ? cr.html : null, sys: qeSysVerdict(sysMsgRing.filter(m => m.at >= t0)), msgs: sysMsgRing.filter(m => m.at >= t0) };
    if (ans.sys.kind) return qeSysRefusal(q, ref, p.link, ans.sys, { clicks, hit, text });
    html = ans.html;`);
rep('qeDialog same', `    if (html) { await sleep(600); html = lastNpcHtml || html; text = htmlText(String(html)).slice(0, 400); }
    // QEPAGE-2026-10-13 (Dagger1 quest 40, Helvetia 13:15: 'Quest' brought the same front page back, the run gave up): the same page again = the
    // answer is late (brain latency) or the click was dropped -> wait up to 8 s for a new page (or the server's refusal), then allow ONE re-click
    if (html && text === prevText) {
      const t1 = now(); while (now() - t1 < 8000 && htmlText(String(lastNpcHtml || '')).slice(0, 400) === prevText && !qeSysVerdict(sysMsgRing.filter(x => x.at >= t0)).kind) await sleep(400);
      { const v = qeSysVerdict(sysMsgRing.filter(x => x.at >= t0)); if (v.kind) return qeSysRefusal(q, ref, p.link, v, { clicks, hit, text }); }
      if (lastNpcHtml) { html = lastNpcHtml; text = htmlText(String(html)).slice(0, 400); }`, `    if (html) text = htmlText(String(html)).slice(0, 400);
    // QEPAGE-2026-10-13 (Dagger1 quest 40, Helvetia 13:15: 'Quest' brought the same front page back, the run gave up): the same page again = the
    // answer is late (brain latency) or the click was dropped -> wait (dialog engine, >= 8 s) for a NEW page (or the server's refusal), then allow ONE re-click
    if (html && text === prevText) {
      const w2 = await DLG.wait({ expect: DLG_PAGES, after: cr.ev ? cr.ev.seq : DLG.seq, base: 8000, dupOk: true, label: \`a new page after "\${p.link.text}"\`, match: (ev) => htmlText(String(ev.data.html || '')).slice(0, 400) !== prevText });
      { const v = qeSysVerdict(sysMsgRing.filter(x => x.at >= t0)); if (v.kind) return qeSysRefusal(q, ref, p.link, v, { clicks, hit, text }); }
      if (w2.ok) { html = w2.ev.data.html; text = htmlText(String(html)).slice(0, 400); }`);
rep('clickQuestDialog', `    const page = waitNpcHtml(CONFIG.gatekeeper.pageTimeoutMs);
    Send.ReqBypassToServer(link.cmd, true);
    html = await page;
    if (html) { await sleep(700); html = lastNpcHtml || html; }`, `    html = await dlgPage(link, CONFIG.gatekeeper.pageTimeoutMs, \`quest \${quest.id}\`);   // DIALOG-2026-10-13
    if (html) await sleep(700);`);
rep('clickTowardAccept', `    const p = waitNpcHtml(CONFIG.gatekeeper.pageTimeoutMs);
    Send.ReqBypassToServer(pick.cmd, true);
    page = await p;
    await sleep(800);`, `    page = await dlgPage(pick, CONFIG.gatekeeper.pageTimeoutMs, 'quest');   // DIALOG-2026-10-13
    await sleep(800);`);
rep('soulTalk', `    const pg = waitNpcHtml(5000);
    Send.ReqBypassToServer(link.cmd, true);
    html = await pg; await sleep(600);
    if (startOnly && /join your cause/i.test(link.text)) { soulQuestSeen(); break; }`, `    html = await dlgPage(link, 5000, npc.Name); await sleep(600);   // DIALOG-2026-10-13
    if (startOnly && /join your cause/i.test(link.text)) { soulQuestSeen(); break; }`);

// ---------------------------------------------------------------- 9. Seven Signs (Priest of Dawn)
rep('dawn signup', `      const pg = waitNpcHtml(15000);   // DAWNWAIT-2026-10-13: 15 s (pages came after > 6 s under load); NO re-click: the same short code on the next page is another link
      Send.ReqBypassToServer(link.cmd, true);
      html = await pg; await sleep(500);`, `      // DAWNWAIT-2026-10-13: 15 s (pages came after > 6 s under load); NO re-click: the same short code on the next page is another link
      html = await dlgPage(link, 15000, npc.Name, { reclick: false }); await sleep(500);   // DIALOG-2026-10-13: the dialog engine (adaptive, refusals end it)`);
rep('dawn stones', `    const pg = waitNpcHtml(6000); Send.ReqBypassToServer(link.cmd, true); html = await pg; await sleep(600);
  }
  try { File.WriteAllText(\`\${__DIR__}\\\\Logs\\\\sevensigns_\${Me.Name}_stones.html\`, String(html || '')); } catch (e) { }`,
  `    html = await dlgPage(link, 6000, npc.Name); await sleep(600);   // DIALOG-2026-10-13
  }
  try { File.WriteAllText(\`\${__DIR__}\\\\Logs\\\\sevensigns_\${Me.Name}_stones.html\`, String(html || '')); } catch (e) { }`);

// ---------------------------------------------------------------- 10. clan pages, siege, clan skills, clan quests
rep('clanCreateAt', `    const pg = waitNpcHtml(6000); Send.ReqBypassToServer(next.cmd, true); html = await pg; await sleep(400);
  }
  return { ok: false, msg: \`\${nm}: did not find the create-clan page\` };`, `    html = await dlgPage(next, 6000, nm); await sleep(400);   // DIALOG-2026-10-13
  }
  return { ok: false, msg: \`\${nm}: did not find the create-clan page\` };`);
rep('villageMasterClick', `    const t0 = now(); const pg = waitNpcHtml(6000); Send.ReqBypassToServer(next.cmd, true); html = await pg; await sleep(600);
    if (hit) return { ok: true, html, link: next.text,`, `    const t0 = now(); html = await dlgPage(next, 6000, nm); await sleep(600);   // DIALOG-2026-10-13
    if (hit) return { ok: true, html, link: next.text,`);
rep('clanLevelUp', `      const t0 = now(); const pg = waitNpcHtml(5000); Send.ReqBypassToServer(yes.cmd, true); html = await pg; await sleep(800);`,
  `      const t0 = now(); html = await dlgPage(yes, 5000, npc.Name); await sleep(800);   // DIALOG-2026-10-13 (a confirm: never clicked twice)`);
rep('cqTalk', `      last = hit.text; const pg = waitNpcHtml(6000); Send.ReqBypassToServer(hit.cmd, true); html = await pg; await sleep(600);`,
  `      last = hit.text; html = await dlgPage(hit, 6000, st.npc); await sleep(600);   // DIALOG-2026-10-13`);
rep('siegeRegister', `      const pg = waitNpcHtml(6000); const t0 = now(); Send.ReqBypassToServer(link.cmd, true); html = await pg;`,
  `      const t0 = now(); html = await dlgPage(link, 6000, 'siege manager');   // DIALOG-2026-10-13`);
rep('clanLearnFocus', `  if (link) { const pg = waitNpcHtml(5000); Send.ReqBypassToServer(link.cmd, true); await pg; await sleep(800); }`,
  `  if (link) { await dlgPage(link, 5000, npc.Name, { reclick: true }); await sleep(800); }   // DIALOG-2026-10-13 (a menu link)`);

// ---------------------------------------------------------------- 11. teleports: floors, Ziggurat, Kamaloka, epic guides, nav atlas, class master
rep('floorTeleport', `    const tp = waitTeleport(8000); Send.ReqBypassToServer(pick.link.cmd, true); const ok = await tp;`,
  `    const fa = await DLG.click(pick.link, { expect: ['teleport'], base: 8000, from: c.name, reclick: true }); const ok = !!fa.ok;   // DIALOG-2026-10-13`);
rep('zigguratEnter', `      const tp = waitTeleport(8000), pg = waitNpcHtml(5000), t1z = now();
      Send.ReqBypassToServer(link.cmd, true);
      const r = await Promise.race([tp.then(ok => ok ? 'tp' : null), pg.then(h => h ? 'page' : null)]);`,
  `      const t1z = now(); const r = await dlgTpOrPage(link, 8000, npc.Name, { reclick: true });   // DIALOG-2026-10-13: a teleport, a page, or the refusal (#1303) at once`);
rep('kama quest page', `        let pg = waitNpcHtml(5000); Send.ReqBypassToServer(\`npc_\${npc.objId}_Quest Kamaloka\`, true); const h2 = await pg;`,
  `        const h2 = await dlgPage(\`npc_\${npc.objId}_Quest Kamaloka\`, 5000, npc.Name, { reclick: true });   // DIALOG-2026-10-13`);
rep('kama bypass', `        const tp2 = waitTeleport(10000); const pg2 = waitNpcHtml(5000);
        Send.ReqBypassToServer(e.bypass, true);
        const r2 = await Promise.race([tp2.then(ok => ok ? 'tp' : null), pg2.then(h => h ? 'page' : null)]);
        if (r2 === 'tp' || (await tp2)) {`, `        const r2 = await dlgTpOrPage(e.bypass, 10000, npc.Name, { thenTpMs: 5000 });   // DIALOG-2026-10-13
        if (r2 === 'tp') {`);
rep('kama link', `    const tp = waitTeleport(8000);
    const pg = waitNpcHtml(5000);
    Send.ReqBypassToServer(link.cmd, true);
    const r = await Promise.race([tp.then(ok => ok ? 'tp' : null), pg.then(h => h ? 'page' : null)]);
    if (r === 'tp' || (await tp)) {`, `    const r = await dlgTpOrPage(link, 8000, npc.Name, { thenTpMs: 3000 });   // DIALOG-2026-10-13: a teleport, the next page, or a refusal (#2100)
    if (r === 'tp') {`);
rep('epic chain page', `      const nx = waitNpcHtml(6000); Send.ReqBypassToServer(l.cmd, true); html = await nx;
      if (!html) { await sleep(600); html = lastNpcHtml; }
      if (!html) { gkFail = \`\${N.name}: no page after "\${l.text}"\`; return false; }`, `      html = await dlgPage(l, 6000, N.name, { reclick: true });   // DIALOG-2026-10-13 (a page link)
      if (!html) { gkFail = \`\${N.name}: no page after "\${l.text}"\${DLG.last && DLG.last.sys ? ' — ' + DLG.last.sys.why : ''}\`; return false; }`);
rep('epic chain last', `    const tp = wantTp ? waitTeleport(9000) : null, nx = wantTp ? null : waitNpcHtml(2500);
    Send.ReqBypassToServer(l.cmd, true);
    if (wantTp) {
      const ok = await tp;`, `    const fin = await DLG.click(l, { expect: wantTp ? ['teleport'] : DLG_PAGES, base: wantTp ? 9000 : 2500, from: N.name, reclick: wantTp });   // DIALOG-2026-10-13
    const nx = Promise.resolve(!wantTp && fin.ok ? fin.html : null);
    if (wantTp) {
      const ok = !!fin.ok;`);
rep('navAtlasNpc', `      const pg = typeof waitNpcHtml === 'function' ? waitNpcHtml(6000) : null;
      Send.ReqBypassToServer(l.cmd, true);
      const h2 = pg ? await pg : null; await sleep(400);`, `      let h2 = null;
      if (typeof DLG !== 'undefined' && typeof dlgPage === 'function') h2 = await dlgPage(l, 6000, npc.name, { expect: ['npc', 'quest', 'teleport'] });   // DIALOG-2026-10-13: a page or a teleport at once
      else { const pg = typeof waitNpcHtml === 'function' ? waitNpcHtml(6000) : null; Send.ReqBypassToServer(l.cmd, true); h2 = pg ? await pg : null; }
      await sleep(400);`);
rep('classMasterChange', `    const pg = waitNpcHtml(5000);
    Send.ReqBypassToServer(link.cmd, true);
    html = await pg;
    await sleep(1500);`, `    html = await dlgPage(link, 5000, npc.Name);   // DIALOG-2026-10-13 (the change itself: never clicked twice)
    await sleep(1500);`);

// ---------------------------------------------------------------- 12. Community Board pages (Career / Cabinet)
rep('pageRequest', `function pageRequest(cmd, ms, prev) {
  const p1 = bbsRequest(cmd), p2 = waitNpcHtml(ms || CONFIG.buffs.pageTimeoutMs);
  // Cabinet -> Settings: the board re-sends the SAME Cabinet page and the real page comes as an NPC dialog (2026-10-04) -> ignore a repeat
  const same = (h) => h && prev && htmlText(h) === htmlText(prev);
  return Promise.race([p1.then(h => (h && !same(h)) ? h : p2), p2.then(h => h || p1.then(b => same(b) ? null : b))]);
}`, `// DIALOG-2026-10-13: one wait in the dialog engine for a board page OR an NPC-style page. label = the button; nav = a navigation button
// (may be clicked once more when provably lost) — a Cabinet toggle / a profession button is an action: never clicked twice
function pageRequest(cmd, ms, prev, label, nav) {
  // Cabinet -> Settings: the board re-sends the SAME Cabinet page and the real page comes as an NPC dialog (2026-10-04) -> ignore a repeat
  const same = (h) => h && prev && htmlText(h) === htmlText(prev);
  return DLG.click({ cmd, text: label || cmd }, { expect: ['board', 'npc', 'quest'], base: ms || CONFIG.buffs.pageTimeoutMs, from: 'the Community Board', reclick: !!nav,
    match: (ev) => !(ev.kind === 'board' && same(ev.data.html)) }).then(r => r.ok ? r.html : null);
}`);
rep('boardPath', `    html = await pageRequest(hit.cmd, null, html);
    if (!html) throw new Error(\`page after '\${label}' did not arrive\`);`, `    html = await pageRequest(hit.cmd, null, html, hit.label, true);
    if (!html) throw new Error(\`page after '\${label}' did not arrive\${DLG.last && DLG.last.why ? ' (' + DLG.last.why + ')' : ''}\`);`);
rep('boardPath home', `async function boardPath(labels) {
  let html = await bbsRequest('_bbshome');`, `async function boardPath(labels) {
  let html = await bbsRequest('_bbshome', 'the board home');`);

fs.writeFileSync(OUT, s);
console.log(`patched ${done.length} anchors -> ${OUT}`);
