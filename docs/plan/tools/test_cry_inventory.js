// CRYINV / CRYHUNT 2026-10-22 (owner: crystallize from a dwarf's inventory on its character page, also while it hunts)
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '..', '..', '..');
const S = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8'), P = fs.readFileSync(path.join(R, 'Dashboard', 'charpage.js'), 'utf8'), C = fs.readFileSync(path.join(R, 'Dashboard', 'charpage.css'), 'utf8');
let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FAIL', n); } };
t('cryBusyWhy: only a monster hitting me = fighting (combat mode alone does not block)', S.includes("if (now() - lastAttackerOnMe.at < 6000) return 'fighting';   // CRYHUNT") && !/if \(IsInCombat \|\| now\(\) - lastAttackerOnMe\.at < 6000\) return 'fighting'/.test(S));
t('cryRun waits for a quiet moment (3 min) instead of refusing', S.includes("if (busy === 'fighting') { setTask('crystallize: waiting for a quiet moment") && S.includes('await quiet(180000)'));
t('cryRun pauses between pieces when attacked', S.includes("setTask('crystallize: paused — a monster hits me'); await quiet(120000)"));
t('worn items still never (cryJudge)', S.includes("if (r.equipped) r.hard = 'worn (equipped) — never'"));
t('inventory: Crystallize button (hidden until the bag report says Crystallize > 0)', P.includes('id="cpCryBtn"') && P.includes('Number(c.bag.skill) > 0'));
t('page reads GET /api/crafter (no server restart needed)', P.includes("api('/api/crafter')"));
t('page check = swarm.js cryBlock (enchanted / special ticks)', P.includes('function cryBlockUi(j)') && P.includes('tick "include enchanted"'));
t('item tap in crystallize mode picks instead of the item menu', P.includes('if (CP.cry.on) { cryPick(it); return; }'));
t('red confirm dialog (uiConfirm danger), YES for enchanted / special', /uiConfirm\(\{ title: `\$\{n\}: crystallize/.test(P) && P.includes("typeToConfirm: risky.length ? 'YES' : ''"));
t('posts to /api/crafter/crystallize with confirm', P.includes("api('/api/crafter/crystallize', { method: 'POST'") && P.includes('confirm: true'));
t('no browser alert/confirm', !/\b(alert|confirm|prompt)\(/.test(P.replace(/uiConfirm\(/g, '').replace(/\/\/[^\n]*/g, '')));
t('styles', C.includes('.cp-it.cry-sel') && C.includes('.cp-crybar'));
// cryBlockUi behaves like swarm.js cryBlock
{ const m = S.match(/function cryBlock\(j, t\) \{[\s\S]*?\n\}/); const f = new Function(m[0] + '; return cryBlock;')();
  t('cryBlock: enchanted needs the tick', /enchanted/.test(f({ enchant: 2, special: [], hard: '' }, {})) && f({ enchant: 2, special: [], hard: '' }, { enchanted: true }) === '');
  t('cryBlock: worn always blocked', /worn/.test(f({ enchant: 0, special: [], hard: 'worn (equipped) — never' }, { enchanted: true, special: true }))); }
t('item menu: Crystallize… button for a piece that may go', P.includes('data-cpcryone=') && P.includes('Crystallize… ('));
t('item menu: the reason when it may not go', P.includes('Crystallize: ${esc(why)}'));
t('item menu button -> the same red confirm', P.includes("CP.cry.sel = new Set([Number(co.dataset.cpcryone)]); try { await cryClick({ dataset: { cpcry: 'go' } })"));
// EQUIPSLOT 2026-10-22: ring 1/2, earring 1/2
t('bot: take off the chosen slot (0x16 + mask), then equip the exact piece', S.includes("const EQUIP_SLOT_MASK = { ring1: 0x20, ring2: 0x10, ear1: 0x04, ear2: 0x02 };") && S.includes("Send.SendHex('16' + cryLe(MASK, 4))"));
t('page: Put on as Ring 1 / 2 (and Earring) with the worn list', P.includes('function jewelBtns(it)') && P.includes('data-cpgo="useslot"') && P.includes("sendOv('use ' + g.dataset.obj + ' ' + sl"));
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
