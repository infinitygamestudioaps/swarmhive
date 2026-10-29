// Headless check of the OVERVIEW start page (#/overview, empty hash; Dashboard/overview.js + overview_api.js, OVERVIEW-2026-10-24):
// the totals, next level-ups with a countdown, just levelled, one card per party (rates, experience line, members with ring + ETA),
// the Characters table (sort), the 24 h switch, #/parties still opens the party cards, no horizontal scroll — iPhone 390x844 + desktop.
// SANDBOX: synthetic demo characters (no real names / adena / gear); the sandbox server of test_partystatus_ui.js (--server: MCP mocked,
// no timers, writes only inside the sandbox); an hour of recorder history (Logs/overview_<day>.tsv), loot, consumables and gear logs.
// Screenshots (safe to share): docs/plan/mobile_check/overview_*.png
//   node docs/plan/tools/test_overview_ui.js
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'plan', 'mobile_check');
const CH = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
if (!CH) { console.log('no Chrome - UI test skipped'); process.exit(0); }
const LE = require(path.join(ROOT, 'Dashboard', 'levelEta.js'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };

// ===================================================================== fixtures ===================================================
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'overview-sb-'));
['Logs', 'Settings', path.join('Scripts', 'data'), path.join('docs', 'plan', 'tools')].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
fs.writeFileSync(path.join(SB, 'docs', 'plan', 'README.md'), '# sandbox\n');
fs.readdirSync(__dirname).filter(f => /\.js$/.test(f)).forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(SB, 'docs', 'plan', 'tools', f)));
fs.writeFileSync(path.join(SB, 'Logs', 'pause_supervisor'), 'sandbox');
// [name, role, class, classId, level, exp %, exp gained per hour (points), adena, adena per hour, activity]
const PARTIES = {
  Ironhelm: [['Ironhelm', 'tank', 'Paladin', 5, 46, 62, 0, 9.4e6, 1.9e6, 'autolevel'], ['Sunleaf', 'healer', 'Elven Elder', 30, 46, 88, 0, 3.1e6, 0.4e6, 'autolevel'],
    ['Emberwyn', 'nuker', 'Spellsinger', 27, 45, 97, 0, 2.2e6, 0.5e6, 'autolevel'], ['Grimbor', 'spoiler', 'Bounty Hunter', 55, 46, 41, 0, 5.8e6, 1.1e6, 'autolevel']],
  Ashvale: [['Ashvale', 'sk', 'Shillien Knight', 33, 61, 23, 0, 31e6, 4.2e6, 'raidcircuit'], ['Morwen', 'bishop', 'Bishop', 16, 61, 55, 0, 12e6, 0.8e6, 'raidcircuit'],
    ['Tarnok', 'destroyer', 'Destroyer', 46, 60, 71, 0, 8e6, 1.2e6, 'raidcircuit']],
  Brightpaw: [['Brightpaw', 'dagger', 'Treasure Hunter', 8, 33, 12, 0, 1.1e6, 0.3e6, 'autolevel'], ['Lumi', 'healer', 'Shillien Elder', 43, 33, 49, 0, 0.6e6, 0.1e6, 'autolevel']],
  Quietus: [['Quietus', 'tank', 'Dark Avenger', 6, 52, 5, 0, 4e6, -0.6e6, 'town'], ['Nyx', 'nuker', 'Necromancer', 13, 52, 66, 0, 2e6, -0.2e6, 'town']],
};
const RATE = { Ironhelm: 7.5, Ashvale: 2.1, Brightpaw: 11, Quietus: 0 };   // exp % per hour for the party
const ACC = []; Object.keys(PARTIES).forEach(p => PARTIES[p].forEach(([c, role]) => ACC.push({ login: 'sb' + ACC.length, character: c, party: p, role })));
fs.writeFileSync(path.join(SB, 'accounts.json'), JSON.stringify(ACC));
const T0 = Date.now(), H = 3600000, iso = (ms) => new Date(ms).toISOString(), day = (t) => iso(t).slice(0, 10);
const total = (lvl, pct) => LE.expTotal(lvl) + (LE.expTotal(lvl + 1) - LE.expTotal(lvl)) * pct / 100;
const size = (lvl) => LE.expTotal(lvl + 1) - LE.expTotal(lvl);
const LEVELLED = 'Emberwyn', DIED = 'Tarnok';
function states(now) {
  const out = [];
  for (const [p, list] of Object.entries(PARTIES)) for (const [name, role, cls, classId, level0, exp0, , adena, adH, act] of list) {
    const up = name === LEVELLED, level = up ? level0 + 1 : level0, exp = up ? 3 : exp0, pctH = RATE[p] * (role === 'healer' ? 0.9 : 1);
    const amt = Math.round(size(level) * pctH / 100);
    out.push({ name, role, cls, classId, level, exp, hp: name === DIED ? 64 : 100, mp: 80, cp: 100, dead: false, x: -87900, y: 86900, z: -3392, bot: true, mode: act, leader: name === p,
      adena: Math.round(adena + adH), soe: 5, res: 3, updated: iso(now), task: act === 'autolevel' ? `autolevel: Cruma Tower: 1st floor · lvl ${level} · 80 kills` : act === 'raidcircuit' ? 'raid circuit: route to the next boss' : 'town: supply run in Giran',
      doing: { activity: act, autolevel: act === 'autolevel' ? { spot: 'Cruma Tower: 1st floor', kills5m: 12 } : null, zone: act === 'autolevel' ? 'Cruma Tower: 1st floor' : '' },
      expHour: pctH ? { pct: pctH, amt, n: act === 'autolevel' ? 140 : 20, mins: 60 } : { pct: 0, amt: 0, n: 0, mins: 60 },
      expLog: up ? [{ amt: 900, pct: 3, at: now - 4 * 60000, why: 'kill Lesser Giant Soldier', lvl: level, up: true }] : [] });
  }
  return out;
}
function writeHistory(now) {
  const lines = [];
  for (const [p, list] of Object.entries(PARTIES)) for (const [name, role, , , level0, exp0, , adena, adH] of list) {
    const pctH = RATE[p] * (role === 'healer' ? 0.9 : 1);
    for (let i = 60; i >= 1; i--) {
      const t = now - i * 60000, k = (60 - i) / 60, up = name === LEVELLED && i < 5;
      const lvl = up ? level0 + 1 : level0, pct = up ? 3 - (i * 0.1) : exp0 - pctH * (1 - k) + 0;
      const e = name === LEVELLED ? total(level0, 97) - size(level0) * pctH / 100 * (1 - k) : total(level0, Math.max(0, exp0 - pctH * (1 - k)));
      lines.push([Math.round(t / 1000), name, p, lvl, Math.round(up ? total(lvl, 0) + 100 : e), Math.round(adena + adH * k), name === DIED && (i === 30 || i === 29) ? 1 : 0, 1, RATE[p] ? 140 : 0].join('\t'));
    }
  }
  fs.writeFileSync(path.join(SB, 'Logs', `overview_${day(now)}.tsv`), lines.join('\n') + '\n');
  // loot (worth from Dashboard/data/item_prices.json), consumables, gear
  const loot = [];
  for (let i = 0; i < 40; i++) { const t = now - i * 90000; loot.push([iso(t), i % 2 ? 'Grimbor' : 'Ironhelm', 'Ironhelm', 3, 'Animal Bone', i % 2 ? 'spoil' : 'loot', 'Cruma Tower: 1st floor', 'hunt'].join('\t')); }
  for (let i = 0; i < 6; i++) loot.push([iso(now - i * 300000), 'Ashvale', 'Ashvale', 1, 'Mithril Ore', 'loot', 'Raid boss', 'circuit'].join('\t'));
  fs.writeFileSync(path.join(SB, 'Logs', `loot_${day(now)}.log`), loot.join('\n') + '\n');
  for (const n of ['Ironhelm', 'Emberwyn', 'Ashvale']) fs.writeFileSync(path.join(SB, 'Logs', `supply_use_${n}.json`), JSON.stringify({ v: 1, b: [{ h: Math.floor((now - 20 * 60000) / H) * H, ms: 1500000, u: { 1463: 900, 1061: 4 } }] }));
  fs.writeFileSync(path.join(SB, 'Logs', 'gear_upgrades.log'), `${iso(now - 15 * 60000)} [Sunleaf] lvl 46 mage (supply run): Karmian Tunic 336105: bought; Karmian Stockings 210325: bought | Karmian Tunic: equipped\n`);
}
// OVBAG-2026-10-29: one bag (Ironhelm) with a worn, a quest, an enchanted, a kept and sellable items; Stem is on the sell list (all bots)
function writeBag(now) {
  const it = (id, name, count, type, x) => Object.assign({ id, objId: 7000 + id, name, count, eq: false, q: false, type }, x || {});
  fs.writeFileSync(path.join(SB, 'Logs', 'bag_Ironhelm.json'), JSON.stringify({ at: iso(now - 6 * 60000), name: 'Ironhelm', items: [it(57, 'Adena', 5000000, 'Etc'), it(1864, 'Stem', 200, 'Mats'),
    it(1878, 'Braided Hemp', 40, 'Mats'), it(129, 'Sword of Revolution', 1, 'Weapon', { enchant: 4 }), it(121, 'Sword of Watershadow', 1, 'Weapon', { eq: true }),
    it(687, "Darin's Letter", 1, 'Etc', { q: true }), it(1061, 'Greater Healing Potion', 30, 'Etc'), it(9, 'Cedar Staff', 1, 'Weapon')] }));
  fs.writeFileSync(path.join(SB, 'Scripts', 'data', 'sell_list.json'), JSON.stringify({ all: [1864], keep: [] }));
  fs.writeFileSync(path.join(SB, 'Scripts', 'data', 'trade_items.json'), JSON.stringify({ notrade: [], cat: { 1061: 'consumable' } }));
}
function writeFixtures() { const now = Date.now(); states(now).forEach(s => fs.writeFileSync(path.join(SB, 'Logs', `swarm_state_${s.name}.json`), JSON.stringify(s))); }

// ===================================================================== browser test ===============================================
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  writeHistory(T0); writeBag(T0); writeFixtures(); const fx = setInterval(writeFixtures, 1000);
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'test_partystatus_ui.js'), '--server', SB], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0; const serr = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; }));
  srv.stderr.on('data', d => serr.push(String(d)));
  let br = null, prof = null, sock = null;
  try {
    for (let i = 0; i < 150 && !PORT; i++) await sleep(100);
    if (!PORT) { console.log(serr.join('')); throw new Error('sandbox server did not start'); }
    const B = `http://127.0.0.1:${PORT}`;
    ok('/overview.js is served', (await fetch(B + '/overview.js')).status === 200);
    const d = await (await fetch(B + '/api/overview?hours=1')).json();
    const C = (n) => d.chars.find(c => c.name === n) || {};
    ok('API: 4 parties, 11 characters', d.parties.length === 4 && d.chars.length === 11, `${d.parties.length} / ${d.chars.length}`);
    ok('API: wallet per hour from the recorder', Math.abs(C('Ironhelm').adenaH - 1.9e6) < 0.1e6, String(C('Ironhelm').adenaH));
    ok('API: one death, one level-up', d.total.deaths === 1 && C(DIED).deaths === 1 && d.ups.some(u => u.name === LEVELLED), `deaths ${d.total.deaths}, ups ${d.ups.map(u => u.name)}`);
    ok('API: loot worth and costs', C('Ironhelm').lootH > 0 && C('Ironhelm').useH > 0 && C('Sunleaf').gearH === 336105 + 210325, `loot ${C('Ironhelm').lootH}, use ${C('Ironhelm').useH}, gear ${C('Sunleaf').gearH}`);
    ok('API: next level-ups sorted, soonest first', d.soon.length >= 3 && d.soon.every((s, i) => !i || s.at >= d.soon[i - 1].at), d.soon.map(s => s.name).join(','));

    prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-chrome-'));
    const DBG = 9300 + Math.floor(Math.random() * 500);
    br = cp.spawn(CH, ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
    let ws = null;
    for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
    if (!ws) throw new Error('no browser');
    sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
    let id = 0; const pend = {}, handlers = [], jsErr = [], posts = [];
    sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
    const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
    const waitFor = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
    const shot = async (name, clip) => { const r = await cdp('Page.captureScreenshot', Object.assign({ format: 'png' }, clip ? { clip, captureBeyondViewport: true } : {})); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); console.log('  shot', name); };
    const clipOf = async (sel, pad = 8) => { const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`); return r && { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad, scale: 1 }; };
    handlers.push((m) => {
      if (m.method === 'Page.javascriptDialogOpening') cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => { });
      if (m.method === 'Runtime.exceptionThrown') jsErr.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
      if (m.method !== 'Fetch.requestPaused') return;
      const rq = m.params.request, rid = m.params.requestId;
      if (rq.method === 'POST') { posts.push(rq.url); return cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"ok":true}').toString('base64') }).catch(() => { }); }
      cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
    });
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await require('./uidialog_testhook')(cdp, handlers, { answer: false });
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });

    for (const dev of [{ n: 'phone', w: 390, h: 844, s: 2, mobile: true }, { n: 'desktop', w: 1440, h: 1000, s: 1, mobile: false }]) {
      console.log(`- ${dev.n} ${dev.w}x${dev.h}`);
      await cdp('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.s, mobile: dev.mobile });
      await cdp('Page.navigate', { url: B + '/' });   // empty hash = the start page
      ok('empty address opens the Overview', await waitFor(`(() => { const s = document.getElementById('tab-overview'); return s && !s.hidden && document.querySelectorAll('.ov-p').length === 4; })()`, 20000));
      ok('Overview tab is the selected tab and comes first', await ev(`(() => { const t = document.getElementById('tabs'); return t.children[0].dataset.tab === 'overview' && t.children[0].classList.contains('on'); })()`));
      await sleep(1500);   // count-up animation
      const K = await ev(`[...document.querySelectorAll('.ov-k')].map(k => k.querySelector('.l').innerText.trim() + ': ' + k.querySelector('.v').innerText.trim())`);
      ok('7 totals: profit, experience, adena, loot, costs, kills, online', K.length === 7 && /Online: 11 \/ 11/.test(K.join('|')), K.join(' | '));
      ok('next level-ups count down', await waitFor(`[...document.querySelectorAll('#ovSoon .t')].some(e => /\\d+(m|h|s)/.test(e.textContent))`), await ev(`document.getElementById('ovSoon').innerText.replace(/\\s+/g, ' ').slice(0, 120)`));
      const ups = await ev(`document.getElementById('ovUps').innerText.replace(/\\s+/g, ' ')`);
      ok('just levelled shows the level-up', new RegExp(LEVELLED + ' reached 46').test(ups), ups);
      ok('party card: members with an experience ring each', await ev(`document.querySelectorAll('.ov-p .ov-m .ov-ring').length === 11`));
      ok('party card: experience line drawn', await ev(`document.querySelectorAll('.ov-p svg.ov-spark polyline').length >= 3`));
      ok('death shown on its party', await ev(`[...document.querySelectorAll('.ov-p')].some(p => /Ashvale/.test(p.innerText) && /1 deaths/.test(p.innerText))`));
      ok('no horizontal scroll', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), await ev(`document.documentElement.scrollWidth + ' > ' + innerWidth`));
      // OVDRILL-2026-10-29: every tile is a button that opens the rows behind it; the rows add up to the tile; Esc closes, focus goes back
      ok('every tile is a button (role, tabindex, aria-label)', await ev(`[...document.querySelectorAll('.ov-k')].every(k => k.getAttribute('role') === 'button' && k.tabIndex === 0 && /Show where/.test(k.getAttribute('aria-label') || ''))`));
      await ev(`document.querySelector('[data-ovk="adena"]').focus(); document.querySelector('[data-ovk="adena"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
      ok('Adena: Enter opens a modal sheet', await waitFor(`(() => { const s = document.querySelector('#ovSheet [role=dialog][aria-modal=true]'); return s && /All bags/.test(s.innerText) && document.querySelectorAll('#ovsBody .ovs-r').length === 11; })()`));
      { const r = await ev(`(() => { const t = document.querySelector('#ovsBody .ovs-tot b').innerText.replace(/,/g, ''); const rows = [...document.querySelectorAll('#ovsBody .ovs-r .v')].map(v => +v.firstChild.textContent.replace(/,/g, '')); return { t: +t, s: rows.reduce((a, b) => a + b, 0), coins: /Coins only/.test(document.getElementById('ovsBody').innerText) }; })()`);
        ok('Adena: per-character rows add up to the total = the tile, "coins only" said', r.t === r.s && r.t === d.total.adena && r.coins, JSON.stringify(r) + ' tile ' + d.total.adena); }
      ok('sheet: no horizontal scroll', await ev(`(() => { const b = document.getElementById('ovsBody'); return b.scrollWidth <= b.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; })()`),
        await ev(`(() => { const b = document.getElementById('ovsBody'), r = b.getBoundingClientRect(); const w = [...b.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > r.right + 1).slice(0, 3).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)); return b.scrollWidth + '/' + b.clientWidth + ' ' + w.join(' | '); })()`));   // OVBAG: what sticks out
      if (dev.mobile) { const c = await clipOf('.ovs', 0); if (c) await shot('overview_phone_sheet_adena.png', c); }
      // OVBAG-2026-10-29: a character row opens its bag (value per item, can sell, sell-list state); Esc goes back to the list; "All bags" = sellable per character
      ok('Adena rows are buttons and show the bag worth', await ev(`(() => { const b = document.querySelector('#ovsBody button.ovs-r[data-ovbag="Ironhelm"]'); return !!b && /bag worth/.test(b.innerText) && /show the bag/.test(b.textContent); })()`));
      await ev(`document.querySelector('[data-ovbag="Ironhelm"]').click()`);
      ok('Bag: opens with its items and "bag read N min ago"', await waitFor(`/Ironhelm.s bag/.test(document.getElementById('ovsT').innerText) && /bag read \\d+ min ago/.test(document.getElementById('ovsAt').innerText) && document.querySelectorAll('#ovsBody .ovs-r').length === 8`),
        await ev(`(document.getElementById('ovsBody') || {}).innerText || ''`).then(t => t.replace(/\s+/g, ' ').slice(0, 200)));
      { const r = await ev(`(() => { const t = +document.querySelector('#ovsBody .ovs-tot b').innerText.replace(/,/g, ''); const v = [...document.querySelectorAll('#ovsBody .ovs-r .v')].map(x => +x.firstChild.textContent.replace(/,/g, '')); const R = (n) => [...document.querySelectorAll('#ovsBody .ovs-r')].find(x => x.querySelector('.n').innerText.includes(n)); const cs = (n) => /can sell/.test(R(n).innerText);
          return { t, s: v.reduce((a, b) => a + b, 0), sorted: v.every((x, i) => !i || v[i - 1] >= x), worn: cs('Watershadow'), quest: cs('Darin'), ench: cs('Revolution'), adena: cs('Adena'), kept: cs('Healing'), stem: cs('Stem') && /marked to sell/.test(R('Stem').innerText), staff: /check \\+enchant/.test(R('Cedar').innerText),
            src: /NPC shop pays/.test(document.getElementById('ovsBody').innerText), link: !!document.querySelector('#ovsBody a[href="#/char/Ironhelm"]') && /Mark junk/.test(document.getElementById('ovsBody').innerText) }; })()`);
        ok('Bag: rows add up to the bag worth, sorted by value, price source said', r.t === r.s && r.sorted && r.src, JSON.stringify(r));
        ok('Bag: worn / quest / enchanted / adena / kept are never "can sell"; Stem can + already marked; gear says check +enchant', !r.worn && !r.quest && !r.ench && !r.adena && !r.kept && r.stem && r.staff, JSON.stringify(r));
        ok('Bag: "To sell: Mark junk" line links to the character page', r.link); }
      ok('Bag: no horizontal scroll', await ev(`(() => { const b = document.getElementById('ovsBody'); return b.scrollWidth <= b.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; })()`));
      if (dev.mobile) { const c = await clipOf('.ovs', 0); if (c) await shot('overview_phone_sheet_bag.png', c); }
      await ev(`document.querySelector('[data-ovsbf="sell"]').click()`);
      ok('Bag: "Can sell" filter shows only sellable rows', await waitFor(`document.querySelectorAll('#ovsBody .ovs-r').length === 3 && [...document.querySelectorAll('#ovsBody .ovs-r')].every(x => /can sell/.test(x.innerText))`));
      await ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      ok('Bag: Esc goes back to the list, focus on that character', await waitFor(`!!document.getElementById('ovSheet') && document.activeElement && document.activeElement.dataset.ovbag === 'Ironhelm'`));
      await ev(`document.querySelector('[data-ovsall="1"]').click()`);
      ok('All bags: sellable worth per character, most first', await waitFor(`(() => { const r = document.querySelectorAll('#ovsBody .ovs-r'); return r.length === 11 && r[0].dataset.ovbag === 'Ironhelm' && /Can sell, all bags/.test(document.getElementById('ovsBody').innerText); })()`));
      await ev(`document.querySelector('[data-ovsall="0"]').click()`); await waitFor(`/Coins only/.test(document.getElementById('ovsBody').innerText)`);
      await ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      ok('Esc closes the sheet, focus back on the tile', await waitFor(`!document.getElementById('ovSheet') && document.activeElement === document.querySelector('[data-ovk="adena"]')`));
      await ev(`document.querySelector('[data-ovk="killsH"]').click()`);
      ok('Kills tile: who died, with the time, level and party', await waitFor(`(() => { const b = document.getElementById('ovsBody'); return b && new RegExp('${DIED}').test(b.innerText) && /lvl 60/.test(b.innerText) && document.querySelectorAll('#ovsBody .ovs-chips span').length === 1; })()`),
        await ev(`(document.getElementById('ovsBody') || {}).innerText || ''`).then(t => t.replace(/\s+/g, ' ').slice(0, 160)));
      ok('Kills tile: death rows = the tile count', await ev(`document.querySelectorAll('#ovsBody .ovs-l')[0].querySelectorAll('.ovs-r').length === ${d.total.deaths}`));
      if (dev.mobile) { const c = await clipOf('.ovs', 0); if (c) await shot('overview_phone_sheet_deaths.png', c); }
      await ev(`document.querySelector('[data-ovsx]').click()`);
      await ev(`document.querySelector('[data-ovk="lootH"]').click()`);
      ok('Loot tile: every item with count x unit price and where the price comes from', await waitFor(`(() => { const b = document.getElementById('ovsBody'); return b && /Animal Bone/.test(b.innerText) && /Mithril Ore/.test(b.innerText) && /NPC shop pays/.test(b.innerText) && / × /.test(b.innerText); })()`));
      { const r = await ev(`(() => { const t = +document.querySelector('#ovsBody .ovs-tot b').innerText.replace(/,/g, ''); const rows = [...document.querySelectorAll('#ovsBody .ovs-r .v')].map(v => +v.textContent.replace(/,/g, '')); return { t, s: rows.reduce((a, b) => a + b, 0) }; })()`);
        ok('Loot: rows add up to the tile (1 h)', r.t === r.s && r.t === d.total.lootH, JSON.stringify(r) + ' tile ' + d.total.lootH); }
      await ev(`document.querySelector('[data-ovsh="24"]').click()`);
      ok('sheet: the 24 h switch inside the sheet', await waitFor(`/last 24 h/.test(document.getElementById('ovsT').innerText) && /÷ 24 h/.test(document.getElementById('ovsBody').innerText)`));
      await ev(`document.getElementById('ovSheet').click()`);   // the backdrop
      ok('backdrop closes the sheet', await waitFor(`!document.getElementById('ovSheet')`));
      for (const k of ['costH', 'profitH', 'expH', 'online']) {
        await ev(`document.querySelector('[data-ovk="${k}"]').click()`);
        ok(`${k} sheet opens with rows`, await waitFor(`document.querySelectorAll('#ovsBody .ovs-r').length > 0 && !/Could not/.test(document.getElementById('ovsBody').innerText)`), await ev(`(document.getElementById('ovsBody') || {}).innerText || ''`).then(t => t.replace(/\s+/g, ' ').slice(0, 120)));
        await ev(`document.querySelector('[data-ovsx]').click()`); await sleep(100);
      }
      await ev(`document.getElementById('tab-overview').scrollIntoView()`); await sleep(400);
      if (dev.mobile) {
        await shot('overview_phone_top.png');
        const c = await clipOf('.ov-p'); if (c) await shot('overview_phone_party.png', c);
      } else {
        const c = await clipOf('#tab-overview', 0); if (c) await shot('overview_desktop.png', Object.assign(c, { height: Math.min(c.height, 1500) }));
      }
      // Characters table + sort by experience
      await ev(`document.querySelector('[data-ovv="chars"]').click()`); await sleep(400);
      ok('Characters: one row each', await ev(`document.querySelectorAll('.ov-t tbody tr').length === 11`));
      for (let i = 0; i < 2; i++) { const on = await ev(`(() => { const t = document.querySelector('.ov-t th[data-ovs="expH"]'); return t.classList.contains('on') && /▾/.test(t.textContent); })()`); if (on) break; await ev(`document.querySelector('.ov-t th[data-ovs="expH"]').click()`); await sleep(300); }
      const ex = await ev(`[...document.querySelectorAll('.ov-t tbody tr')].map(r => r.dataset.ovc)`);
      const want = d.chars.slice().sort((a, b) => (b.expH || 0) - (a.expH || 0)).map(c => c.name);
      ok('Characters: sorted by experience per hour, most first', ex.join(',') === want.join(','), ex.slice(0, 4).join(',') + ' / ' + want.slice(0, 4).join(','));
      if (dev.mobile) { const c = await clipOf('.ov-twrap'); if (c) await shot('overview_phone_characters.png', Object.assign(c, { height: Math.min(c.height, 1300) })); }
      await ev(`document.querySelector('[data-ovv="parties"]').click()`); await sleep(200);
      // 24 h switch
      await ev(`document.querySelector('[data-ovh="24"]').click()`);
      ok('24 h switch reloads', await waitFor(`document.querySelector('[data-ovh="24"]').classList.contains('on')`));
      await ev(`document.querySelector('[data-ovh="1"]').click()`); await sleep(300);
      // #/parties still opens the party cards
      await ev(`location.hash = '#/parties'`);
      ok('#/parties opens the party cards (Overview hidden)', await waitFor(`!document.getElementById('tab-parties').hidden && document.getElementById('tab-overview').hidden`));
      await ev(`location.hash = '#/overview'`);
      ok('#/overview comes back', await waitFor(`!document.getElementById('tab-overview').hidden`));
    }
    // reduced motion: no animations
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    ok('reduced motion: no animation', await ev(`getComputedStyle(document.querySelector('.ov-k')).animationName === 'none'`));
    ok('no JavaScript errors', jsErr.length === 0, jsErr.slice(0, 3).join(' | '));
    ok('no POST requests were sent', posts.length === 0, posts.join(', '));
  } finally {
    clearInterval(fx);
    try { sock && sock.close(); } catch (e) { }
    try { if (br) cp.execSync(`taskkill /T /F /PID ${br.pid}`, { stdio: 'ignore' }); } catch (e) { }
    // OVDRILL-2026-10-29: taskkill /T missed the Chrome children (8 left on 2026-10-29) -> also kill every chrome.exe with this test's profile folder
    try { if (prof) cp.execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | ? { $_.CommandLine -like '*${path.basename(prof)}*' } | % { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' }); } catch (e) { }
    try { srv.kill(); } catch (e) { }
    await sleep(800);
    try { prof && fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { }
    try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  }
  console.log(fails ? `${fails} FAILED` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
