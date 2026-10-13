// TEST: ROUTE ATLAS LAYER in the raid boss route editor (2026-10-12, Dashboard/raidspage.js RouteAtlas + index.html routeEditor hooks).
// 1) the pure block (ROUTEATLAS-PURE) against the real nav atlas files: Orfen (gk + 23 geodata points), Tillion = a swim route (2026-10-13), an unreachable / blocked boss (no prefill,
//    reason), floor / door / enter markers, every raid route parses; 2) the hooks in index.html / circuitpage.js are there and every inline
//    script compiles; 3) the live dashboard API (read-only GETs, skipped when :8090 is down): /api/navatlas?key=raid:29014, ?list=unreachable,
//    /api/route?id=29014. Never writes anything. Use: node docs/plan/tools/test_route_atlas.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DASH = path.join(ROOT, 'Dashboard'), ATLAS = path.join(ROOT, 'Scripts', 'data', 'nav_atlas');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL', m); } };
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

// ---- 1. pure block
const src = fs.readFileSync(path.join(DASH, 'raidspage.js'), 'utf8');
const m = src.match(/\/\/ ROUTEATLAS-PURE-BEGIN([\s\S]*?)\/\/ ROUTEATLAS-PURE-END/);
ok(!!m, 'ROUTEATLAS-PURE block found');
const ctx = {}; vm.createContext(ctx); vm.runInContext(m[1] + '\nthis.F = { raSegments, raWalkPts, raMarkers, raSummary, raPrefill };', ctx);
const F = ctx.F;
const orfen = J(path.join(ATLAS, 't', 'raid_29014.json'));
const segs = F.raSegments(orfen), pts = F.raWalkPts(orfen), pre = F.raPrefill(orfen), S = F.raSummary(orfen);
ok(segs.length === 1 && segs[0].how === 'geodata', 'Orfen: one geodata walk leg');
ok(pts.length === 23, 'Orfen: 23 walk points (got ' + pts.length + ')');
ok(pre && pre.pts.length === 23, 'Orfen: prefill has the 23 points');
ok(pre && pre.start && pre.start.kind === 'gk' && pre.start.desc === 'Oren -> Sea of Spores', 'Orfen: start = gatekeeper Oren -> Sea of Spores');
ok(pre && pre.L && pre.L.x === 64328 && pre.pts[0].x === 64328 && pre.pts[0].y === 26803, 'Orfen: point 1 = the Sea of Spores landing');
ok(pre && Math.hypot(pre.pts[22].x - 55024, pre.pts[22].y - 17368) < 50, 'Orfen: last point at the boss');
ok(S.status === 'ok' && !S.bad && S.len === 13396 && /\.oren/.test(S.chain) && /arrive/.test(S.chain), 'Orfen: summary ok / 13396 / chain');
ok(F.raMarkers(orfen).some(k => k.kind === 'landing'), 'Orfen: landing marker');

const idx = J(path.join(ATLAS, 'index.json')), raidRows = idx.targets.filter(t => /^raid:/.test(t[0]));
const routes = Object.assign({}, J(path.join(ATLAS, 'raid.json')).routes);
let checked = 0, prefilled = 0, partial = 0, bad = 0, errs = 0;
const kinds = {};
raidRows.forEach(t => {
  const r = routes[t[0]]; if (!r) return; checked++;
  try {
    const s = F.raSummary(r), p = F.raPrefill(r), w = F.raWalkPts(r);
    F.raMarkers(r).forEach(k => { kinds[k.kind] = (kinds[k.kind] || 0) + 1; ok(isFinite(k.x) && isFinite(k.y), t[0] + ' marker xy'); });
    if (s.bad) { bad++; ok(p === null, t[0] + ' bad route must not prefill'); ok(s.why.length > 0, t[0] + ' bad route has a reason'); }
    else if (w.length >= 2) {
      const stop = (r.steps || []).findIndex(q => /^(floor|enter|need)$/.test(q.do));
      if (stop < 0) { prefilled++; ok(p && p.pts.length === w.length && p.start && !p.partial, t[0] + ' prefill with a start'); }
      else { partial++; ok(!p || (p.partial && p.pts.length <= w.length), t[0] + ' prefill stops at ' + r.steps[stop].do); }
    }
    w.forEach((q, i) => { if (i) ok(!(q.x === w[i - 1].x && q.y === w[i - 1].y && q.z === w[i - 1].z), t[0] + ' no duplicate joins'); });
  } catch (e) { errs++; console.log('ERR', t[0], e.message); }
});
ok(checked === raidRows.length, `every raid row has a route (${checked}/${raidRows.length})`);
ok(errs === 0, 'no exceptions over all raid routes');
ok(bad >= 1, 'at least one unreachable / blocked raid (Benom: castle doors)');
ok(kinds.floor > 0 && kinds.door > 0 && kinds.enter > 0, 'floor / door / enter markers seen ' + JSON.stringify(kinds));
const till = routes['raid:25484'];
// Tillion (2026-10-13): reachable by SWIMMING (Devil Isle landing, walk, ~5 km of sea onto his beach; water_zones.js, test_swim_routes.js)
const tillP = till && F.raPrefill(till);
ok(till && !F.raSummary(till).bad && till.status !== 'unreachable' && (till.flags || []).includes('swim') && tillP && tillP.start && /Devil Isle/.test(tillP.start.desc || ''), 'Tillion: reachable (swim route), prefill starts at Giran -> Devil Isle');
const g = routes['raid:25244'], gp = g && F.raPrefill(g);
ok(gp && /Dwyph/.test(gp.partial) && gp.pts.length < F.raWalkPts(g).length, 'Giants Cave boss: prefill ends at the floor teleporter Dwyph');
ok(F.raPrefill(null) === null && F.raSummary(null).bad && F.raWalkPts({ steps: [{ do: 'walk', points: [1, 2] }] }).length === 0, 'empty / broken input');
console.log(`pure: ${checked} raid routes, ${prefilled} prefillable, ${partial} partial (floor / entry), ${bad} unreachable/blocked, markers ${JSON.stringify(kinds)}`);

// ---- 2. hooks
const html = fs.readFileSync(path.join(DASH, 'index.html'), 'utf8');
['RouteAtlas.get(d.id)', 'RouteAtlas.prefillRed(RED)', 'RouteAtlas.fitPts(RED.atlas)', 'RouteAtlas.svgLayer(RED.atlas, u)', 'RouteAtlas.legend(RED.atlas)',
  'RouteAtlas.infoHtml(RED)', 'RouteAtlas.bind(box, RED, set)', 'computed — not saved yet', 'RED.fromAtlas = false'].forEach(k => ok(html.includes(k), 'index.html hook ' + k));
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let mm, n = 0, bc = 0;
while ((mm = re.exec(html))) { n++; try { new vm.Script(mm[1]); } catch (e) { bc++; console.log('inline script', n, e.message); } }
ok(bc === 0, `index.html inline scripts compile (${n})`);
// circuitpage.js is OWNER ONLY (not in the public package): its checks run only where it exists
const HAS_CIRCUIT = fs.existsSync(path.join(DASH, 'circuitpage.js'));
if (!HAS_CIRCUIT) console.log('skip: circuitpage.js checks (owner-only page, not in this install)');
['raidspage.js'].concat(HAS_CIRCUIT ? ['circuitpage.js'] : []).forEach(f => { try { new vm.Script(fs.readFileSync(path.join(DASH, f), 'utf8')); ok(true); } catch (e) { ok(false, f + ' compiles: ' + e.message); } });
if (HAS_CIRCUIT) ok(/RouteAtlas\.badMap\(render\)/.test(fs.readFileSync(path.join(DASH, 'circuitpage.js'), 'utf8')), 'circuit list uses badMap');
ok(/RouteAtlas\.factsHtml\(b\.id, renderBossStatus\)/.test(src) && /split\('\/'\)\[3\] === 'route'/.test(src), 'boss page Facts preview + #/raid/<id>/route');
ok(!/\balert\(|\bconfirm\(|\bprompt\(/.test(src.slice(src.indexOf('ROUTE ATLAS LAYER'))), 'no browser alert / confirm / prompt in the block');

// ---- 2b. ROUTE VIEW API in-process (Dashboard/routeview_api.js view(), no server needed) + the bots' route choice (patch_routeuse.js)
{
  const RV = require(path.join(DASH, 'routeview_api.js'));
  const rctx = { DIR: DASH, DATA: path.join(ROOT, 'Scripts', 'data'), ROOT, LOGS: path.join(ROOT, 'Logs') };
  const V = (t, extra) => RV.view(rctx, new URLSearchParams(Object.assign({ target: t }, extra || {})));
  const o = V('raid:29014', { from: '82760,53578,-1470', party: 'Tank1' });
  ok(!o.error && o.atlas && o.atlas.status === 'ok' && o.target.name === 'Orfen' && o.from && o.from.toStart > 0, 'routeview Orfen: atlas + from distances');
  ok(o.use === (o.custom ? (o.custom.use || (o.custom.manual ? 'custom' : 'atlas')) : 'atlas') && o.canChoose === !!o.custom, 'routeview Orfen: use + canChoose consistent');
  const t = V('raid:25484'); ok(t.atlas && t.atlas.status !== 'unreachable' && (t.atlas.flags || []).includes('swim'), 'routeview Tillion: reachable, swim route');
  const a = V('raid:25029'); ok(a.obstacles.some(x => x.kind === 'door') && a.obstacles.some(x => x.kind === 'skill') && a.items.some(i => i.id === 1661 && (i.sources.shops.length > 0 || !fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'buylists')))), 'routeview Atraiban: Unlock door + Thief Key with shops (shops = datapack buylists, dev install only)');
  const b = V('raid:29020', { party: 'Tank1' }); const bf = b.items.find(i => i.id === 4295);
  ok(bf && bf.sources.drops.length > 0 && bf.sources.drops.some(d => (d.areas || []).length) && bf.sources.quests.length > 0 && typeof bf.partyHas === 'boolean', 'routeview Baium: Blooded Fabric — who drops it, where, which quest, party has?');
  ok(b.obstacles.some(x => x.kind === 'enter') && b.obstacles.some(x => x.kind === 'door'), 'routeview Baium: vortex entry + door');
  const n = V('npc:30177'); ok(n.target.key.startsWith('npc:30177@') && n.atlas, 'routeview npc:30177 resolves to its spawn');
  const q = V('quest:258:1'); ok(q.quest && q.quest.sel === 1 && /^area:/.test(q.target.key) && q.quest.steps.length === 3, 'routeview quest 258 step 2 = the Wolf hunting area');
  const q0 = V('quest:636'); ok(q0.quest && /^npc:31329@/.test(q0.target.key), 'routeview quest 636 step 1 = Eliyah');
  const r = V('room:cruma-1-left-a'); ok(r.obstacles.some(x => x.kind === 'floor'), 'routeview Cruma room: floor teleporter listed');
  ok(V('foo').error && V('npc:999999').error, 'routeview: bad targets answer an error');
  // every raid target answers without exceptions
  let errs2 = 0; raidRows.forEach(t2 => { try { const v = V(t2[0]); if (v.error) errs2++; } catch (e) { errs2++; console.log('routeview', t2[0], e.message); } });
  ok(errs2 === 0, 'routeview: all ' + raidRows.length + ' raid targets');
  const html2 = fs.readFileSync(path.join(DASH, 'routeview.js'), 'utf8');
  ok(!/\balert\(|\bconfirm\(|\bprompt\(/.test(html2.replace(/uiConfirm|uiAlert|uiPrompt/g, '')), 'routeview.js: no browser dialogs');
  const srv = fs.readFileSync(path.join(DASH, 'server.js'), 'utf8');
  ok(srv.includes("require('./routeview_api').handle(") && srv.includes("b.action === 'use'") && srv.includes('ROUTE USE kept across saves'), 'server.js: /api/routeview hook + routeApi use action + use kept on save');
  // the bots: raidRouteUse in Scripts_dev/swarm.js (patch_routeuse.js)
  const sw = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8'), mm2 = sw.match(/function raidRouteUse\(r\) \{[^\n]*\}/);
  if (!mm2) console.log('patch_routeuse not applied to Scripts_dev/swarm.js: bot checks skipped');
  else {
    const c2 = {}; vm.createContext(c2); vm.runInContext(mm2[0] + '; this.f = raidRouteUse;', c2);
    ok(c2.f(null) === 'atlas' && c2.f({ manual: true }) === 'custom' && c2.f({ manual: false }) === 'atlas' && c2.f({ manual: true, use: 'atlas' }) === 'atlas' && c2.f({ use: 'custom' }) === 'custom', 'raidRouteUse rules');
    ok((sw.match(/ROUTE-USE/g) || []).length >= 5 && /urUse === 'custom' \? null : await navAtlasTrip\(\{ type: 'raid', id: b\.id/.test(sw), 'swarm.js: mission + epic travel honour use (epic now tries the atlas)');
  }
}

// ---- 3. live API (read-only)
const KEY = (() => { try { return fs.readFileSync(path.join(DASH, 'key.txt'), 'utf8').trim(); } catch (e) { return ''; } })();
const get = (p) => new Promise((res) => { const rq = http.get({ host: '127.0.0.1', port: 8090, path: p, headers: { 'x-key': KEY }, timeout: 8000 }, (r) => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res({ code: r.statusCode, d: JSON.parse(b) }); } catch (e) { res({ code: r.statusCode, d: null }); } }); }); rq.on('error', () => res(null)); rq.on('timeout', () => { rq.destroy(); res(null); }); });
(async () => {
  const a = await get('/api/navatlas?key=raid%3A29014');
  if (!a) { console.log('live API: dashboard :8090 not reachable, skipped'); }
  else {
    ok(a.code === 200 && a.d && a.d.route && a.d.route.status === 'ok', 'API navatlas raid:29014');
    ok(a.d && a.d.route && F.raPrefill(a.d.route) && F.raPrefill(a.d.route).pts.length === 23, 'API route prefills 23 points');
    const u = await get('/api/navatlas?list=unreachable');
    const ki = u && u.d && u.d.cols ? u.d.cols.indexOf('key') : -1;
    ok(u && u.d && !(u.d.rows || []).some(r => r[ki] === 'raid:25484') && (u.d.rows || []).some(r => r[ki] === 'area:plains-of-lizardmen-33'), 'API unreachable list: Tillion gone (swim route), Plains of Lizardmen 33 still there');
    const r = await get('/api/route?id=29014');
    ok(r && r.d && r.d.boss && r.d.boss.name === 'Orfen', 'API /api/route?id=29014 answers (' + (r && r.d && r.d.route ? 'saved route' : 'no saved route') + ')');
  }
  console.log(`${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
