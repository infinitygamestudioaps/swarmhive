// 3D VIEW (owner 2026-10-17: "show a live view of the game from all the data we have ... see if someone goes off a cliff ... command a character
// to move by clicking the simulator world"). #/view3d/<name>: the ground around that character from the geodata (/api/view3d/terrain) with the
// game's own map art on it, dungeon walls from the walk bits, and every character / monster / NPC near it as live figures (the APIs the
// dashboard already has: /api/state every 2 s, /api/partymobs, /api/char). Tap a figure = what it is doing; tap the ground = "walk there"
// (!goto x y, asks first). Step 1 of 3: no game models (step 3 converts them from the player's own installed client, on their own PC).
// three.js r160 is served from Dashboard/vendor (works without internet). Loaded as a module; index.html calls window.View3D.route().
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { loadModel, clipFor, loadStatic, placementMatrix, loadCharacter, loadBakedTile } from './l2model.js';

const SEC = 'view3dSec';
const $id = (i) => document.getElementById(i);
const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HOLE = -32768, TILE = 8192;
const S = { open: false, name: '', me: null, party: '', T: null, ox: 0, oy: 0, r: 3000, ents: new Map(), sel: null, tap: null, follow: true, timers: [], loadingT: false, msg: '', events: [], prev: new Map(), fx: [], replay: null };
let R = null;   // three.js state: { renderer, scene, camera, controls, terrain, walls, marker, lines, raf }

function api(u, o) { return window.api ? window.api(u, o) : fetch(u, o).then(r => r.json()); }
function section() {
  let s = $id(SEC); if (s) return s;
  s = document.createElement('section'); s.id = SEC; s.className = 'win v3d'; s.hidden = true;
  s.innerHTML = `<div class="v3d-head"><h2 id="v3dTitle">3D view</h2>
      <div class="v3d-bar"><button type="button" class="v3d-btn" data-v3d="follow">Follow</button><button type="button" class="v3d-btn" data-v3d="top">From above</button><button type="button" class="v3d-btn" data-v3d="replay">Replay 10 min</button><button type="button" class="v3d-btn" data-v3d="char">Character page</button></div></div>
    <div id="v3dReplay" hidden></div>
    <div class="v3d-wrap"><canvas id="v3dCanvas"></canvas><div class="v3d-msg" id="v3dMsg" role="status"></div><div class="v3d-feed" id="v3dFeed" hidden></div>
      <div class="v3d-legend"><span><i style="background:#4fb3ff"></i>my party</span><span><i style="background:#c8c8c8"></i>other characters</span><span><i style="background:#e24c4c"></i>aggressive monster</span><span><i style="background:#d88a8a"></i>monster</span><span><i style="background:#f0c040"></i>raid boss</span><span><i style="background:#6ad07a"></i>NPC</span></div></div>
    <div class="v3d-info" id="v3dInfo"></div>`;
  (document.querySelector('main') || document.body).appendChild(s);
  s.addEventListener('click', onClick);
  return s;
}
function route(kind, arg) {
  if (kind === 'view3d' && arg) { open(decodeURIComponent(arg)); return true; }
  close(); return false;
}
function open(name) {
  const s = section();
  try { window.stopChar && window.stopChar(); } catch (e) { }
  document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
  s.hidden = false;
  if (S.open && S.name === name) return;
  close(true);
  Object.assign(S, { open: true, name, me: null, T: null, sel: null, tap: null, follow: true, msg: '', events: [], prev: new Map(), fx: [], replay: null, boss: null });
  const bossId = /^boss:\d+$/.test(name) ? +name.slice(5) : 0;   // BOSS SCENE: #/view3d/boss:<npc id>
  renderFeed(); renderReplay();
  $id('v3dTitle').textContent = bossId ? '3D view — raid boss' : `3D view — ${name}`;
  setMsg(bossId ? 'Loading the boss…' : 'Loading the ground…');
  initThree();
  if (bossId) { S.boss = { pending: true }; S.timers.push(setInterval(tickState, 2000)); openBoss(bossId); renderInfo(); return; }
  tickState();
  S.timers.push(setInterval(tickState, 2000), setInterval(tickMobs, 5000), setInterval(tickNpcs, 7000), setInterval(tickLive, 700));   // tickLive: party + monsters every 0.7 s
  setTimeout(tickMobs, 400); setTimeout(tickNpcs, 900);
  renderInfo();
}
function close(keep) {
  S.timers.forEach(t => clearInterval(t)); S.timers = [];
  if (S.replay) { clearInterval(S.replay.timer); S.replay = null; }
  S.fx = [];
  if (R) {
    cancelAnimationFrame(R.raf);
    try { R.controls.dispose(); } catch (e) { }
    R.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } });
    try { R.renderer.dispose(); } catch (e) { }
    window.removeEventListener('resize', R.onResize);
    R = null;
  }
  BLD.gen++; BLD.group = null; TILES.gen++; TILES.map.clear();
  S.ents = new Map();
  if (!keep) { S.open = false; const s = $id(SEC); if (s) s.hidden = true; }
}
function setMsg(t) { S.msg = t || ''; const m = $id('v3dMsg'); if (m) { m.textContent = S.msg; m.hidden = !S.msg; } }

// ---- three.js scene --------------------------------------------------------------------------------------------------------------------
function initThree() {
  const cv = $id('v3dCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101418); scene.fog = new THREE.Fog(0x101418, 6000, 14000);
  const camera = new THREE.PerspectiveCamera(50, 1, 20, 40000);
  camera.position.set(0, 1800, 1800);
  const controls = new OrbitControls(camera, cv); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 150; controls.maxDistance = 9000;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2f22, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(2000, 4000, 1000); scene.add(sun);
  const marker = new THREE.Mesh(new THREE.RingGeometry(40, 60, 32), new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide })); marker.rotation.x = -Math.PI / 2; marker.visible = false; scene.add(marker);
  const lines = new THREE.Group(); scene.add(lines);
  R = { renderer, scene, camera, controls, terrain: null, walls: null, marker, lines, raf: 0 };
  R.onResize = () => { const w = cv.parentElement.clientWidth, hh = cv.parentElement.clientHeight; renderer.setSize(w, hh, false); camera.aspect = w / Math.max(1, hh); camera.updateProjectionMatrix(); };
  window.addEventListener('resize', R.onResize); R.onResize();
  controls.addEventListener('start', () => { S.follow = false; paintBar(); });
  // tap (not drag) = pick
  let down = null;
  cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  cv.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 7 && Date.now() - down.t < 600) pick(e); down = null; });
  const loop = () => {
    if (!R) return;
    R.raf = requestAnimationFrame(loop);
    S.ents.forEach(en => { en.g.position.lerp(en.to, 0.22); });
    animateFx(); tickModels();
    if (S.follow && S.me) { const en = S.ents.get('c:' + S.me.name); if (en) { const d = en.g.position.clone().sub(controls.target); controls.target.add(d); camera.position.add(d); } }
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
}
/** world (x, y, z) -> scene position (y up; world y = scene z) */
const P = (x, y, z) => new THREE.Vector3(x - S.ox, z, y - S.oy);

async function loadTerrain(me) {
  if (S.loadingT) return; S.loadingT = true;
  try {
    const under = me.z < -4500;
    const r = under ? 2400 : 4000, step = under ? 16 : 32;
    // never wait forever (owner 2026-10-17: "stuck at Loading the ground"): 20 s, then the next state tick asks again
    const T = await Promise.race([new Promise((_, no) => setTimeout(() => no(new Error('no answer in 20 s — trying again')), 20000)), api(`/api/view3d/terrain?x=${Math.round(me.x)}&y=${Math.round(me.y)}&z=${Math.round(me.z)}&r=${r}&step=${step}${under ? '' : '&flat=' + (await hasBuildings(me, r) ? 1 : 0)}`)]);
    if (!T || T.error || !R) { setMsg('Could not read the ground: ' + ((T && T.error) || 'no answer')); return; }
    const raw = (b64, Ctor) => { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Ctor(u8.buffer); };
    T.H = raw(T.h, Int16Array); T.W = raw(T.w, Uint8Array);
    const first = !S.T;
    S.T = T; S.r = r;
    if (first) { S.ox = me.x; S.oy = me.y; }
    buildTerrain(T, under);
    loadBuildings(me, r);
    setMsg('');
    if (first) { const p = P(me.x, me.y, me.z); R.controls.target.copy(p); R.camera.position.set(p.x, p.y + 650, p.z + 750); }
  } catch (e) { setMsg('Could not read the ground: ' + e.message); }
  finally { S.loadingT = false; }
}
function buildTerrain(T, under) {
  const { n, step, x0, y0, H, W } = T;
  // a dungeon = deep (z < -4500) or much of the square has no floor (rooms + corridors); the catacombs lie at about -4976
  { let holes = 0; for (let k = 0; k < n * n; k++) if (H[k] === HOLE) holes++; if (holes / (n * n) > 0.15) under = true; }
  [R.terrain, R.walls].forEach(m => { if (m) { R.scene.remove(m); m.geometry.dispose(); (m.material.map && m.material.map.dispose()); m.material.dispose(); } });
  const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), col = new Float32Array(n * n * 3);
  let zmin = 1e9, zmax = -1e9; for (let k = 0; k < n * n; k++) if (H[k] !== HOLE) { zmin = Math.min(zmin, H[k]); zmax = Math.max(zmax, H[k]); }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, z = H[k] === HOLE ? zmin : H[k];
    pos[k * 3] = x0 + i * step - S.ox; pos[k * 3 + 1] = z; pos[k * 3 + 2] = y0 + j * step - S.oy;
    uv[k * 2] = i / (n - 1); uv[k * 2 + 1] = 1 - j / (n - 1);
    const t = zmax > zmin ? (z - zmin) / (zmax - zmin) : 0.5; col[k * 3] = 0.35 + t * 0.35; col[k * 3 + 1] = 0.33 + t * 0.3; col[k * 3 + 2] = 0.28 + t * 0.22;
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (H[a] === HOLE || H[b] === HOLE || H[c] === HOLE || H[d] === HOLE) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  R.terrain = new THREE.Mesh(g, mat); R.scene.add(R.terrain);
  mapArt(T, S.me ? S.me.z < -4500 : under).then(tex => { if (tex && R && R.terrain && R.terrain.geometry === g) { mat.map = tex; mat.vertexColors = false; mat.color.set(0xffffff); mat.needsUpdate = true; } });
  // walls: a blocked side of a cell (walk bits) with ground on the other side = a stone wall 140 high (dungeons, buildings)
  const wp = [];
  const E = 1, Wb = 2, So = 4, No = 8, WH = 140, half = step / 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; if (H[k] === HOLE) continue;
    const z = H[k], cx = x0 + i * step - S.ox, cy = y0 + j * step - S.oy, w = W[k];
    // WALLS (owner 2026-10-17: "why can't I see walls in catacombs / necropolis?"): the room edges there have NO floor on the other side,
    // and those edges were skipped. Now: (a) the floor ends (no ground / ground far above) = a full wall on that side, every direction;
    // (b) a blocked walk bit with floor on both sides = a wall too (doors, pillars, building walls). A drop to ground far BELOW stays open (a ledge).
    const side = (blocked, ni, nj, ax, ay, bx, by) => {
      const out = ni < 0 || nj < 0 || ni >= n || nj >= n; if (out) return;
      const nh = H[nj * n + ni];
      let wh = 0;
      if (nh === HOLE) wh = under ? 200 : 0;                     // the floor ends (underground: the room's wall)
      else if (under && nh - z > 160 && nh - z <= 400) wh = nh - z;   // indoors: a ledge up to the next level (the ground mesh draws everything else)
      else if (blocked && Math.abs(nh - z) <= 160) wh = WH;      // a wall in the walk data with floor on both sides
      if (!wh) return;
      wp.push(ax, z, ay, bx, z, by, bx, z + wh, by, ax, z, ay, bx, z + wh, by, ax, z + wh, ay);
    };
    side(!(w & E), i + 1, j, cx + half, cy - half, cx + half, cy + half);
    side(!(w & So), i, j + 1, cx - half, cy + half, cx + half, cy + half);
    // west / north: only the "floor ends" walls (a blocked bit there is drawn by the neighbour's east / south side)
    if (i > 0 && (H[k - 1] === HOLE || H[k - 1] - z > 160)) side(false, i - 1, j, cx - half, cy - half, cx - half, cy + half);
    if (j > 0 && (H[k - n] === HOLE || H[k - n] - z > 160)) side(false, i, j - 1, cx - half, cy - half, cx + half, cy - half);
  }
  if (wp.length) {
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wp), 3)); wg.computeVertexNormals();
    R.walls = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x9a8d78, side: THREE.DoubleSide, transparent: true, opacity: 0.62, depthWrite: false }));
    R.scene.add(R.walls);
  } else R.walls = null;
}
/** the game's map art for the ground square (the same /minitile pieces the 2D maps use; underground floors: their own layer, else none) */
function mapArt(T, under) {
  const size = T.n * T.step, px = 8, W = Math.max(64, Math.round(size / px));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = W;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#4a4438'; ctx.fillRect(0, 0, W, W);
  const jobs = []; let drawn = 0;
  for (let gx = Math.floor(T.x0 / TILE); gx * TILE < T.x0 + size; gx++) for (let gy = Math.floor(T.y0 / TILE); gy * TILE < T.y0 + size; gy++) {
    const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, col = gx - Math.floor(gx / 4) * 4, row = gy - Math.floor(gy / 4) * 4;
    let sfx = ''; try { sfx = typeof window.ugLayer === 'function' ? window.ugLayer(RX, RY, S.me ? S.me.z : 0, (gx + 0.5) * TILE, (gy + 0.5) * TILE) : ''; } catch (e) { }
    if (under && !sfx) continue;                       // underground without its own art: plain stone colours (never the surface picture)
    jobs.push(new Promise(res => { const im = new Image(); im.onload = () => { ctx.drawImage(im, (gx * TILE - T.x0) / px, (gy * TILE - T.y0) / px, TILE / px, TILE / px); drawn++; res(); }; im.onerror = () => res(); im.src = `/minitile/${RX}_${RY}${sfx}_${col}_${row}.jpg`; }));
  }
  return Promise.all(jobs).then(() => { if (!drawn) return null; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
}

// ---- live figures ------------------------------------------------------------------------------------------------------------------------
function label(text, sub, hp) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 72; const c = cv.getContext('2d');
  c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.85)'; c.fillStyle = '#fff';
  c.strokeText(text, 128, 28); c.fillText(text, 128, 28);
  if (sub) { c.font = '20px sans-serif'; c.fillStyle = '#e3c27a'; c.strokeText(sub, 128, 50); c.fillText(sub, 128, 50); }
  if (hp != null) { c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(48, 58, 160, 10); c.fillStyle = hp > 50 ? '#3fbf5a' : hp > 25 ? '#e0b030' : '#e04040'; c.fillRect(49, 59, Math.max(0, Math.min(100, hp)) * 1.58, 8); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(200, 56, 1); sp.renderOrder = 10; return sp;
}
function figure(color, big) {
  const g = new THREE.Group(), s = big ? 1.15 : 1;   // TRUE SIZE (owner 2026-10-17): an L2 character is about 70 high
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(9 * s, 28 * s, 4, 10), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 23 * s; g.add(body);   // an L2 character model is ~45 high (elf 42)
  const ring = new THREE.Mesh(new THREE.RingGeometry(14 * s, 19 * s, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 3; g.add(ring);
  return g;
}
function upsert(key, o) {
  let en = S.ents.get(key);
  const sig = `${o.label}|${o.sub || ''}|${o.hp == null ? '' : Math.round(o.hp / 5)}|${o.color}|${o.dead ? 1 : 0}`;
  if (!en) {
    const g = figure(o.color, o.big); g.position.copy(P(o.x, o.y, o.z)); R.scene.add(g);
    en = { g, to: P(o.x, o.y, o.z), sig: '', lab: null }; S.ents.set(key, en);
  }
  en.to = P(o.x, o.y, o.z); en.data = o; en.seen = Date.now();
  if (en.sig !== sig) {
    if (en.lab) { en.g.remove(en.lab); en.lab.material.map.dispose(); en.lab.material.dispose(); }
    en.lab = label(o.label, o.sub, o.hp); en.lab.position.y = Math.max(70, (en.labelY || 0)); en.g.add(en.lab); en.sig = sig;
    en.g.children[0].material.color.set(o.dead ? 0x555555 : o.color); en.g.children[0].rotation.z = o.dead ? Math.PI / 2 : 0;
  }
}
function prune(prefix, maxAge) {
  S.ents.forEach((en, k) => { if (k.startsWith(prefix) && (maxAge < 0 || Date.now() - en.seen > maxAge)) { unloadModel(en); if (en.cast && en.cast.beam) { R.scene.remove(en.cast.beam); en.cast.beam.geometry.dispose(); en.cast.beam.material.dispose(); } R.scene.remove(en.g); en.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); S.ents.delete(k); } });
}
const near = (o) => S.me && Math.hypot(o.x - S.me.x, o.y - S.me.y) < S.r * 1.05 && Math.abs((o.z || 0) - S.me.z) < (S.me.z < -5000 ? 500 : 2500);
async function tickState() {
  if (!S.open || !R || S.replay) return;
  if (S.boss && S.boss.pending) return;
  if (S.boss) { let st; try { st = await api('/api/state'); } catch (e) { return; } if (!R || !st || !st.chars) return; st.chars.forEach(c => { if (c.x == null || !near(c)) return; upsert('c:' + c.name, { kind: 'char', x: c.x, y: c.y, z: c.z, label: c.name, sub: `${c.cls || ''} ${c.level || ''}`.trim(), hp: c.hp, dead: c.dead, color: 0x4fb3ff, c }); }); prune('c:', 6000); return; }
  let st; try { st = await api('/api/state'); } catch (e) { return; }
  if (!S.open || !R || !st || !st.chars || S.replay) return;
  await applyChars(st.chars.filter(c => c.x != null).map(c => ({ name: c.name, x: c.x, y: c.y, z: c.z, hp: c.hp, mp: c.mp, dead: !!c.dead, party: c.party || c.name, level: c.level, cls: c.cls,
    task: c.task || c.mode, cast: c.cast && !c.cast.ended ? { name: c.cast.name, target: c.cast.target, ms: Number(c.cast.ms) || 0, start: Date.parse(c.cast.start) || 0 } : null,
    tpos: c.tpos && c.tpos.x != null ? c.tpos : null, route: c.route, c })), Date.now());
}
/** one moment of every character (live or a replay frame): figures, lines, effects, events */
async function applyChars(list, now) {
  const me = list.find(c => c.name === S.name);
  if (!me) { setMsg(S.replay ? `${S.name} is not in this moment of the replay.` : `${S.name} is not online.`); return; }
  S.me = me; S.party = me.party || me.name;
  if (!S.T || Math.hypot(me.x - (S.T.x0 + S.T.n * S.T.step / 2), me.y - (S.T.y0 + S.T.n * S.T.step / 2)) > S.r * 0.45 || Math.abs(me.z - S.T.z) > 400) await loadTerrain(me);
  if (!R) return;
  list.forEach(c => {
    if (!near(c)) return;
    const mine = c.party === S.party;
    upsert('c:' + c.name, { kind: 'char', x: c.x, y: c.y, z: c.z, label: c.name, sub: `${c.cls || ''} ${c.level || ''}`.trim(), hp: c.hp, dead: c.dead, color: c.name === S.name ? 0x2f8fff : mine ? 0x4fb3ff : 0xc8c8c8, big: c.name === S.name, c: c.c || c });
    detectEvents(c, now);
    castFx(c, now);
  });
  prune('c:', S.replay ? 3000 : 6000);
  drawLines(list.filter(c => near(c) && c.party === S.party));
  renderInfo();
}

// ---- step 2: effects + events ------------------------------------------------------------------------------------------------------------
const HEAL_RE = /heal|recharge|resurrect|restor|cleanse|purify|remedy|cure|vitaliz|blessing of light|life/i;
const BUFF_RE = /might|shield|empower|acumen|haste|focus|wind walk|guidance|death whisper|berserker|concentration|magic barrier|chant|song|dance|blessing|prophecy|victor|magnus|bless|greater|soul cry|vampiric|frenzy|zealot|rage|guts|ultimate/i;
function castColor(name) { return HEAL_RE.test(name) ? 0x58e070 : BUFF_RE.test(name) ? 0x5aa8ff : 0xff9a3c; }
function feed(kind, text, at, pos) {
  S.events = S.events || [];
  const key = kind + '|' + text;
  if (S.events.some(e => e.key === key && Math.abs(e.at - at) < 15000)) return;
  S.events.unshift({ key, kind, text, at, pos }); S.events = S.events.slice(0, 30);
  renderFeed();
}
function renderFeed() {
  const box = $id('v3dFeed'); if (!box) return;
  const ic = { dead: '✖', revive: '✚', fall: '⤓', hit: '!' };
  box.innerHTML = (S.events || []).slice(0, 6).map((e, i) => `<button type="button" class="v3d-ev ${e.kind}" data-v3d="ev" data-i="${i}"><b>${ic[e.kind] || '•'}</b> ${h(e.text)} <span>${new Date(e.at).toLocaleTimeString().slice(0, 5)}</span></button>`).join('');
  box.hidden = !(S.events || []).length;
}
/** death / revive / big hit / a fall (the height dropped more than 250 in one step while the character moved little = off a ledge) */
function detectEvents(c, now) {
  S.prev = S.prev || new Map();
  const p = S.prev.get(c.name); S.prev.set(c.name, { x: c.x, y: c.y, z: c.z, hp: c.hp, dead: c.dead, at: now });
  if (!p || now - p.at > 8000) return;
  const pos = { x: c.x, y: c.y, z: c.z };
  if (c.dead && !p.dead) { feed('dead', `${c.name} died`, now, pos); marker(pos, 0xff3030, 60000, 'dead'); }
  else if (!c.dead && p.dead) { feed('revive', `${c.name} is alive again`, now, pos); marker(pos, 0x58e070, 6000, 'revive'); }
  else if (!c.dead && p.hp != null && c.hp != null && p.hp - c.hp >= 20) { feed('hit', `${c.name} lost ${Math.round(p.hp - c.hp)} % HP`, now, pos); const en = S.ents.get('c:' + c.name); if (en) en.flashUntil = performance.now() + 900; }
  const moved = Math.hypot(c.x - p.x, c.y - p.y);
  if (!c.dead && p.z - c.z > 250 && moved < 900) { feed('fall', `${c.name} dropped ${Math.round(p.z - c.z)} (off a ledge?)`, now, pos); marker({ x: p.x, y: p.y, z: p.z }, 0xffb030, 30000, 'fall'); }
}
function marker(pos, color, ms, kind) {
  if (!R) return;
  const g = new THREE.Group();
  if (kind === 'dead') {
    const m = new THREE.MeshBasicMaterial({ color });
    const a = new THREE.Mesh(new THREE.BoxGeometry(110, 8, 18), m), b = new THREE.Mesh(new THREE.BoxGeometry(110, 8, 18), m);
    a.rotation.y = Math.PI / 4; b.rotation.y = -Math.PI / 4; g.add(a, b);
  } else {
    const ring = new THREE.Mesh(new THREE.RingGeometry(50, 70, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    if (kind === 'fall') { const pole = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 160), new THREE.MeshBasicMaterial({ color })); pole.position.y = 80; g.add(pole); }
  }
  g.position.copy(P(pos.x, pos.y, (pos.z || 0) + 6)); R.scene.add(g);
  S.fx = S.fx || []; S.fx.push({ g, until: performance.now() + ms, grow: kind === 'revive' });
}
/** while a character casts: a glowing ring (green heal / blue buff / orange attack), a beam to the target and the skill name over it */
function castFx(c, now) {
  const en = S.ents.get('c:' + c.name); if (!en) return;
  const k = c.cast, live = k && k.name && now - k.start < k.ms + 600;
  if (!live) { if (en.cast) { en.g.remove(en.cast.g); en.cast.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); if (en.cast.beam) { R.scene.remove(en.cast.beam); en.cast.beam.geometry.dispose(); en.cast.beam.material.dispose(); } en.cast = null; } return; }
  const col = castColor(k.name);
  if (!en.cast || en.cast.sig !== k.name + k.start) {
    if (en.cast) castFx({ name: c.name, cast: null }, now);
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(48, 6, 8, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 10; g.add(ring);
    const lab = label(k.name, k.target ? '→ ' + k.target : '', null); lab.scale.set(190, 53, 1); lab.position.y = 150; g.add(lab);
    en.g.add(g); en.cast = { g, ring, sig: k.name + k.start, start: k.start, ms: k.ms, col, target: k.target, beam: null };
  }
  // the beam to the target: a figure with that name near me, else the target position the bot reported
  let to = null;
  if (k.target) S.ents.forEach(o => { if (!to && o.data && o.data.label === k.target && o.g.position.distanceTo(en.g.position) < 2500) to = o.g.position; });
  if (!to && c.tpos && c.tpos.x != null) to = P(c.tpos.x, c.tpos.y, (c.tpos.z != null ? c.tpos.z : c.z));
  if (en.cast.beam) { R.scene.remove(en.cast.beam); en.cast.beam.geometry.dispose(); en.cast.beam.material.dispose(); en.cast.beam = null; }
  if (to && to.distanceTo(en.to) > 60) {
    const a = en.to.clone().add(new THREE.Vector3(0, 90, 0)), b = to.clone().add(new THREE.Vector3(0, 70, 0));
    en.cast.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
    R.scene.add(en.cast.beam);
  }
}
/** per animation frame: cast rings pulse, hit flashes, markers fade */
function animateFx() {
  const t = performance.now();
  S.ents.forEach(en => {
    if (en.cast) { const s = 1 + 0.25 * Math.sin(t / 120); en.cast.ring.scale.set(s, s, s); }
    const body = en.g.children[0]; if (!body || !body.material) return;
    const fl = en.flashUntil && en.flashUntil > t;
    if (fl !== !!en.flashing) { en.flashing = fl; body.material.emissive = body.material.emissive || new THREE.Color(0); body.material.emissive.set(fl ? 0xff2020 : 0x000000); }
  });
  (S.fx || []).forEach(f => { const left = f.until - t; f.g.traverse(o => { if (o.material && o.material.transparent !== undefined) { o.material.transparent = true; o.material.opacity = Math.max(0.15, Math.min(1, left / 4000)); } }); if (f.grow) { const s = 1 + (1 - Math.max(0, left) / 6000) * 2; f.g.scale.set(s, 1, s); } });
  const gone = (S.fx || []).filter(f => f.until <= t);
  gone.forEach(f => { R.scene.remove(f.g); f.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); });
  S.fx = (S.fx || []).filter(f => f.until > t);
}

// ---- step 2: replay (the server keeps the last 10 min of every character) ----------------------------------------------------------------
async function replayStart() {
  let d; try { d = await api('/api/view3d/history?since=0'); } catch (e) { setMsg('No replay: ' + e.message); return; }
  if (!d || !d.frames || d.frames.length < 3) { setMsg('Nothing recorded yet: the replay keeps the last 10 minutes from when the dashboard started.'); setTimeout(() => setMsg(''), 5000); return; }
  S.replay = { frames: d.frames, i: 0, playing: true, speed: 4, timer: null };
  prune('m:', -1); prune('n:', -1); S.prev = new Map();
  renderReplay(); replayGo(0); replayPlay(true);
}
function replayStop() {
  if (!S.replay) return; clearInterval(S.replay.timer); S.replay = null; S.prev = new Map();
  renderReplay(); tickState(); tickMobs(); tickNpcs();
}
function rowToChar(r) { return { name: r[0], x: r[1], y: r[2], z: r[3], hp: r[4], mp: r[5], dead: !!r[6], cast: r[7] ? { name: r[7], target: r[8], ms: r[9], start: r[10] } : null, tpos: r[11] != null ? { x: r[11], y: r[12] } : null, party: r[13] || r[0], level: r[14], cls: r[15] }; }
function replayGo(i) {
  const R2 = S.replay; if (!R2) return;
  R2.i = Math.max(0, Math.min(R2.frames.length - 1, i));
  const f = R2.frames[R2.i];
  applyChars(f.c.map(rowToChar), f.t);
  const sl = $id('v3dSlider'); if (sl) sl.value = R2.i;
  const tl = $id('v3dTime'); if (tl) tl.textContent = new Date(f.t).toLocaleTimeString() + ` (${Math.round((Date.now() - f.t) / 60000)} min ago)`;
}
function replayPlay(on) {
  const R2 = S.replay; if (!R2) return;
  R2.playing = on; clearInterval(R2.timer);
  if (on) R2.timer = setInterval(() => { if (!S.replay) return; if (R2.i >= R2.frames.length - 1) { replayPlay(false); return; } replayGo(R2.i + 1); }, 2000 / R2.speed);
  renderReplay();
}
function renderReplay() {
  const box = $id('v3dReplay'); if (!box) return;
  const R2 = S.replay;
  box.hidden = !R2;
  if (!R2) { box.innerHTML = ''; paintBar(); return; }
  box.innerHTML = `<div class="v3d-rp"><button type="button" class="v3d-btn" data-v3d="rpplay">${R2.playing ? 'Pause' : 'Play'}</button>
    <button type="button" class="v3d-btn" data-v3d="rpspeed">x${R2.speed}</button>
    <input type="range" id="v3dSlider" min="0" max="${R2.frames.length - 1}" value="${R2.i}" aria-label="Replay time">
    <button type="button" class="v3d-go" data-v3d="rplive">Back to live</button></div><div class="muted" id="v3dTime"></div>`;
  const sl = $id('v3dSlider'); sl.addEventListener('input', () => { replayPlay(false); replayGo(+sl.value); });
  paintBar();
}
async function tickMobs() {
  if (!S.open || !R || !S.party || S.replay || S.boss) return;
  let d; try { d = await api(`/api/partymobs?name=${encodeURIComponent(S.party)}`); } catch (e) { return; }
  if (!R || !d) return;
  // only the raid boss names here (the figures come from tickLive, live every 0.7 s)
  S.raidNames = new Set((d.mobs || []).filter(m => m.raid).map(m => m.n));
}
/** LIVE (owner: "can it update faster?"): my party + the monsters around, straight from L2Swarm every 0.7 s (/api/view3d/live) */
let liveBusy = false;
async function tickLive() {
  if (!S.open || !R || S.replay || liveBusy || !S.me || S.boss) return;
  liveBusy = true;
  try {
    const d = await api(`/api/view3d/live?name=${encodeURIComponent(S.name)}`);
    if (!d || !R || S.replay) return;
    (d.party || []).forEach(p => {
      if (p.x == null || !near(p)) return;
      const en = S.ents.get('c:' + p.name), old = en && en.data ? en.data : {};
      upsert('c:' + p.name, Object.assign({}, old, { kind: 'char', x: p.x, y: p.y, z: p.z, hp: p.hp, dead: p.dead, label: p.name, sub: `${p.cls || ''} ${p.lvl || ''}`.trim(),
        color: p.name === S.name ? 0x2f8fff : 0x4fb3ff, big: p.name === S.name, c: Object.assign({}, old.c || {}, { name: p.name, hp: Math.round(p.hp), mp: Math.round(p.mp), dead: p.dead, level: p.lvl, cls: p.cls }) }));
      if (p.name === S.name) Object.assign(S.me, { x: p.x, y: p.y, z: p.z });
      detectEvents({ name: p.name, x: p.x, y: p.y, z: p.z, hp: p.hp, dead: p.dead }, Date.now());
    });
    const raid = S.raidNames || new Set();
    (d.mobs || []).forEach(m => {
      if (m.x == null || !near(m)) return;
      const boss = raid.has(m.n);
      upsert('m:' + m.id, { kind: 'mob', x: m.x, y: m.y, z: m.z, label: m.n, sub: (m.lvl ? 'lvl ' + m.lvl : '') + (m.agg ? ' · aggressive' : ''), hp: m.hp, dead: m.dead, color: boss ? 0xf0c040 : m.agg ? 0xe24c4c : 0xd88a8a, big: boss, m });
    });
    prune('m:', 2500);
  } catch (e) { } finally { liveBusy = false; }
}
async function tickNpcs() {
  if (!S.open || !R || !S.name || S.replay || S.boss) return;
  let d; try { d = await api(`/api/char?name=${encodeURIComponent(S.name)}`); } catch (e) { return; }
  if (!R || !d) return;
  (d.npcs || []).forEach(n => { const x = n.x != null ? n.x : n.X, y = n.y != null ? n.y : n.Y, z = n.z != null ? n.z : n.Z; if (x == null) return; const o = { x, y, z };
    if (!near(o)) return; upsert(`n:${n.name || n.Name}:${Math.round(x / 40)}:${Math.round(y / 40)}`, { kind: 'npc', x, y, z, label: n.name || n.Name || 'NPC', sub: n.title || '', color: 0x6ad07a, n }); });
  prune('n:', 15000);
}
function drawLines(party) {
  R.lines.children.slice().forEach(o => { R.lines.remove(o); o.geometry.dispose(); o.material.dispose(); });
  party.forEach(c => {
    // target line (red) and the walking route (yellow) of my party
    if (c.tpos && c.tpos.x != null) {
      const g = new THREE.BufferGeometry().setFromPoints([P(c.x, c.y, c.z + 60), P(c.tpos.x, c.tpos.y, (c.tpos.z != null ? c.tpos.z : c.z) + 60)]);
      R.lines.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff5050 })));
    }
    const pts = c.route && Array.isArray(c.route.pts) ? c.route.pts : null;
    if (pts && pts.length > 1) {
      const i0 = Math.max(0, (c.route.i || 0) - 1);
      const vs = pts.slice(i0).map(p => Array.isArray(p) ? P(p[0], p[1], (p[2] != null ? p[2] : c.z) + 25) : P(p.x, p.y, (p.z != null ? p.z : c.z) + 25));
      if (vs.length > 1) { const g = new THREE.BufferGeometry().setFromPoints(vs); const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xffe066, dashSize: 60, gapSize: 40 })); l.computeLineDistances(); R.lines.add(l); }
    }
  });
}

// ---- picking + orders -------------------------------------------------------------------------------------------------------------------
function pick(e) {
  if (!R) return;
  const r = R.renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(v, R.camera);
  const figs = []; S.ents.forEach((en, k) => { en.g.children[0].userData.key = k; figs.push(en.g.children[0]); });
  const hit = ray.intersectObjects(figs, false)[0];
  if (hit) { S.sel = hit.object.userData.key; S.tap = null; R.marker.visible = false; renderInfo(); return; }
  const g = R.terrain && ray.intersectObject(R.terrain, false)[0];
  if (g) {
    const wx = Math.round(g.point.x + S.ox), wy = Math.round(g.point.z + S.oy), wz = Math.round(g.point.y);
    S.tap = { x: wx, y: wy, z: wz }; S.sel = null;
    R.marker.position.set(g.point.x, g.point.y + 4, g.point.z); R.marker.visible = true;
    renderInfo();
  }
}
function renderInfo() {
  const box = $id('v3dInfo'); if (!box) return;
  paintBar();
  if (S.tap && !S.replay) {
    const d = S.me ? Math.round(Math.hypot(S.tap.x - S.me.x, S.tap.y - S.me.y)) : 0;
    box.innerHTML = `<div class="v3d-card"><b>This spot</b> <span class="muted">${S.tap.x}, ${S.tap.y}, ${S.tap.z} · ${d} away from ${h(S.name)}</span>
      <div class="v3d-acts"><button type="button" class="v3d-go" data-v3d="walkme">Walk ${h(S.name)} here</button><button type="button" class="v3d-go" data-v3d="walkparty">Walk the whole party here</button><button type="button" class="v3d-btn" data-v3d="untap">Cancel</button></div></div>`;
    return;
  }
  const en = S.sel && S.ents.get(S.sel);
  if (en) {
    const o = en.data;
    if (o.kind === 'char') {
      const c = o.c;
      box.innerHTML = `<div class="v3d-card"><b>${h(c.name)}</b> <span class="muted">${h(c.cls || '')} · level ${h(c.level || '?')}${c.dead ? ' · <b class="bad">dead</b>' : ''}</span>
        <div>HP ${h(c.hp)} % · MP ${h(c.mp)} % · ${h(String(c.task || c.mode || '').slice(0, 120))}</div>
        <div class="v3d-acts"><button type="button" class="v3d-btn" data-v3d="look" data-n="${h(c.name)}">Follow ${h(c.name)}</button><a class="v3d-btn" href="#/char/${encodeURIComponent(c.name)}">Character page</a></div></div>`;
    } else box.innerHTML = `<div class="v3d-card"><b>${h(o.label)}</b> <span class="muted">${o.kind === 'mob' ? 'monster' : 'NPC'}${o.sub ? ' · ' + h(o.sub) : ''}</span>${o.hp != null ? `<div>HP ${h(Math.round(o.hp))} %</div>` : ''}</div>`;
    return;
  }
  const setupCard = (typeof MODEL !== 'undefined' && MODEL.off) ? `<div class="v3d-card"><b>Game models</b><div>${h(MODEL.off)}</div><div class="v3d-acts"><button type="button" class="v3d-go" data-v3d="setupmodels">Set up game models</button></div></div>` : '';
  if (S.boss && !S.boss.pending && !S.tap && !(S.sel && S.ents.get(S.sel))) { box.innerHTML = setupCard + bossCard(); return; }
  const me = S.me;
  box.innerHTML = setupCard + (me ? `<div class="v3d-card"><b>${h(me.name)}</b> <span class="muted">level ${h(me.level)} · HP ${h(me.hp)} % · MP ${h(me.mp)} %</span><div>${h(String(me.task || '').slice(0, 140))}</div>
    <div class="muted">Tap the ground to send ${h(me.name)} (or the party) there · tap a figure to see what it is · drag to turn, pinch / wheel to zoom.</div></div>` : '');
}
function paintBar() { const b = document.querySelector('[data-v3d="follow"]'); if (b) b.classList.toggle('on', S.follow); const r = document.querySelector('[data-v3d="replay"]'); if (r) { r.classList.toggle('on', !!S.replay); r.textContent = S.replay ? 'Replaying…' : 'Replay 10 min'; } }
async function walk(party) {
  const t = S.tap; if (!t) return;
  const who = party ? `the whole party of ${S.party}` : S.name;
  const ok = window.uiConfirm ? await window.uiConfirm({ title: 'Walk there?', body: `${who} walks to ${t.x}, ${t.y}. A party leader stops leveling for it and waits there for your next order.`, confirmText: 'Walk' }) : true;
  if (!ok) return;
  try {
    const r = await api('/api/command', { method: 'POST', body: JSON.stringify({ cmd: `!goto ${t.x} ${t.y}`, targets: [party ? 'party:' + S.party : 'char:' + S.name] }) });
    if (r && r.ok) { setMsg(`Sent: ${who} walks there.`); setTimeout(() => setMsg(''), 4000); S.tap = null; renderInfo(); }
    else setMsg('Not sent: ' + ((r && r.error) || 'no answer'));
  } catch (e) { setMsg('Not sent: ' + e.message); }
}
function onClick(e) {
  const b = e.target.closest('[data-v3d]'); if (!b) return;
  const a = b.dataset.v3d;
  if (a === 'follow') { S.follow = !S.follow; paintBar(); }
  else if (a === 'top' && R) { const t = R.controls.target; R.camera.position.set(t.x, t.y + 3800, t.z + 60); S.follow = true; paintBar(); }
  else if (a === 'setupmodels') setupModels();
  else if (a === 'replay') { if (S.replay) replayStop(); else replayStart(); }
  else if (a === 'rpplay') replayPlay(!(S.replay && S.replay.playing));
  else if (a === 'rpspeed' && S.replay) { S.replay.speed = S.replay.speed >= 16 ? 1 : S.replay.speed * 2; replayPlay(S.replay.playing); }
  else if (a === 'rplive') replayStop();
  else if (a === 'ev') { const e = (S.events || [])[+b.dataset.i]; if (e && e.pos && R) { S.follow = false; const p = P(e.pos.x, e.pos.y, e.pos.z || 0), d = p.clone().sub(R.controls.target); R.controls.target.add(d); R.camera.position.add(d); paintBar(); } }
  else if (a === 'char') location.hash = '#/char/' + encodeURIComponent(S.name);
  else if (a === 'walkme') walk(false);
  else if (a === 'walkparty') walk(true);
  else if (a === 'untap') { S.tap = null; if (R) R.marker.visible = false; renderInfo(); }
  else if (a === 'look') { const n = b.dataset.n; if (n && n !== S.name) location.hash = '#/view3d/' + encodeURIComponent(n); else { S.follow = true; paintBar(); } }
}
window.View3D = { route, open, close, _state: S, _bld: () => ({ gen: BLD.gen, children: BLD.group ? BLD.group.children.length : 0, stat: BLD.stat }), _test: { upsert: (k, o) => upsert(k, o) } };   // _test: the UI test places a monster (no live data in the sandbox)
// the router may have run before this module loaded (a direct link to #/view3d/<name>)
try { const [k, a] = location.hash.replace(/^#\/?/, '').split('/'); if (k === 'view3d' && a) route(k, a); } catch (e) { }

// ---- game models (owner 2026-10-17: "character models and enemies"; the player's own client, exported on demand into Dashboard/l2cache) ----
// Monsters / NPCs within MODEL.range of the camera get their real model (idle / run / attack / death); farther ones stay simple figures and a
// model far away is unloaded again (phones). Characters come later (their gear is built from separate armour parts).
const MODEL = { range: 2200, max: 30, retryMs: 2500, clock: new THREE.Clock(), loading: 0, off: null };
async function requestModel(en) {
  const o = en.data; if (!o || en.modelBusy || MODEL.off) return;
  en.modelBusy = true; MODEL.loading++;
  try {
    const lvl = (o.m && o.m.lvl) || 0, isChar = o.kind === 'char';
    const info = await api(isChar ? `/api/l2model/char?name=${encodeURIComponent(o.label)}` : `/api/l2model/npc?name=${encodeURIComponent(o.label)}&lvl=${lvl}`);
    if (!info || info.pending) { en.modelRetryAt = performance.now() + MODEL.retryMs; return; }
    if (!info.ok) { en.modelNone = true; if (info.setup) { MODEL.off = info.why; setMsg(info.why); } return; }
    const md = isChar ? await loadCharacter(info) : await loadModel(info);
    if (isChar) { md.stance = info.stance || 'Hand'; info.meta = (info.parts && info.parts[0] && info.parts[0].meta) || {}; }
    if (!R || !S.ents.has(en.key)) return;
    const meta = info.meta || {}, sc = (info.drawScale || 1) * ((meta.scale && meta.scale.X) || 1), yaw = ((meta.rot && meta.rot.Yaw) || 0) / 65536 * Math.PI * 2;
    md.object.rotation.y = -yaw + Math.PI / 2;           // RotOrigin (Unreal yaw, mirrored axes) -> the model looks along +Z like the pivot's facing
    md.object.scale.setScalar(sc);
    const pivot = new THREE.Group(); pivot.add(md.object); pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(md.mesh); md.object.position.y = -box.min.y;   // feet on the ground
    en.labelY = (box.max.y - box.min.y) + 30; if (en.lab) en.lab.position.y = Math.max(70, en.labelY);
    if (o.heading != null) { const a = o.heading / 65536 * Math.PI * 2; pivot.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)); }   // a scripted heading (Baium faces into his room)
    md.pivot = pivot; pivot.userData.model = true; en.g.add(pivot);
    en.g.children[0].visible = false; en.g.children[0].material.transparent = true;   // the capsule stays (taps hit it) but is not drawn
    en.model = md; en.modelState = '';
  } catch (e) { en.modelNone = true; }
  finally { en.modelBusy = false; MODEL.loading--; }
}
function unloadModel(en) {
  if (!en || !en.model) return;
  const md = en.model; en.model = null;
  try { md.mixer.stopAllAction(); } catch (e) { }
  en.g.remove(md.pivot || md.object);
  md.object.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });   // the textures are shared: never disposed here
  if (en.g.children[0]) en.g.children[0].visible = true;
}
/** a character's clip: Wait / Run / Atk01 / CastLong / SitWait / Death of its weapon stance (the set is named <Clip>_<Stance>_<rg>) */
function charClip(clips, state, stance) {
  const names = Object.keys(clips), low = names.map(n => n.toLowerCase());
  const want = { idle: ['wait_' + stance, 'wait_hand'], run: ['run_' + stance, 'run_hand'], attack: ['atk01_' + stance, 'atk01_hand'], cast: ['castlong', 'castmid'], sit: ['sitwait'], death: ['death_'] }[state] || ['wait_hand'];
  for (const w of want) { const i = low.findIndex(n => n.startsWith(w.toLowerCase())); if (i >= 0) return clips[names[i]]; }
  return null;
}
function modelPlay(en, state) {
  const md = en.model; if (!md || en.modelState === state) return;
  const clip = md.stance ? (charClip(md.clips, state, md.stance) || charClip(md.clips, 'idle', md.stance)) : (clipFor(md.clips, state) || clipFor(md.clips, 'idle')); if (!clip) return;
  const next = md.mixer.clipAction(clip);
  if (state === 'death') { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
  next.reset().play();
  if (en.modelAction && en.modelAction !== next) en.modelAction.crossFadeTo(next, 0.25, false);
  en.modelAction = next; en.modelState = state;
}
function tickModels() {
  if (!R) return;
  const dt = Math.min(0.1, MODEL.clock.getDelta());
  const c = R.controls.target; let count = 0; const cand = [];
  S.ents.forEach((en, k) => {
    en.key = k;
    const kind = en.data && en.data.kind;
    if (kind !== 'mob' && kind !== 'npc' && kind !== 'char') return;
    const d = en.g.position.distanceTo(c);
    if (en.model) {
      if (d > MODEL.range * 1.3) { unloadModel(en); return; }
      count++;
      // state: dead > moving > fighting (a monster near one of my party and losing HP / in combat) > idle
      const moved = en.lastPos ? en.g.position.distanceTo(en.lastPos) : 0;
      if (moved > 0.4) { const dir = new THREE.Vector3().subVectors(en.g.position, en.lastPos); (en.model.pivot || en.model.object).rotation.y = Math.atan2(dir.x, dir.z); }
      en.lastPos = (en.lastPos || new THREE.Vector3()).copy(en.g.position);
      const o = en.data, hpDrop = o.hp != null && en.lastHp != null && o.hp < en.lastHp;
      if (o.hp != null) en.lastHp = o.hp;
      if (hpDrop) en.fightUntil = performance.now() + 4000;
      const c = o.c || {}, casting = c.cast && !c.cast.ended && c.cast.name;
      const state = o.dead ? 'death' : moved > 0.6 ? 'run' : (o.kind === 'char' && casting) ? 'cast' : (o.kind === 'char' && (c.sitting || c.mode === 'resting')) ? 'sit' : ((en.fightUntil && en.fightUntil > performance.now()) || (o.kind === 'char' && c.combat)) ? 'attack' : 'idle';
      modelPlay(en, state);
      en.model.mixer.update(dt);
      if (!en.snapDone && en.modelState) { en.snapDone = true; const mo = en.model.object; en.g.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(en.model.mesh); if (isFinite(bx.min.y)) mo.position.y += en.g.position.y - bx.min.y; }
    } else if (d < MODEL.range && !en.modelNone && !en.modelBusy && (!en.modelRetryAt || en.modelRetryAt < performance.now())) cand.push([d, en]);
  });
  cand.sort((a, b) => a[0] - b[0]);
  for (const [, en] of cand) { if (MODEL.loading >= 3 || count >= MODEL.max) break; requestModel(en); count++; }
}

/** one-time setup for public users: download UE Viewer (free, gildor.org) into <swarm folder>/tools/umodel; models come from the player's own client */
async function setupModels() {
  const ok = window.uiConfirm ? await window.uiConfirm({ title: 'Set up game models?', body: 'The dashboard downloads UE Viewer (free, by Gildor) from gildor.org into the tools folder of your swarm. It converts monster models from YOUR installed Lineage 2 the first time they are seen; the models stay on this PC (Dashboard/l2cache) and are never shared.', confirmText: 'Download UE Viewer' }) : true;
  if (!ok) return;
  setMsg('Downloading UE Viewer…');
  try {
    const r = await api('/api/l2model/setup', { method: 'POST', body: '{}' });
    if (r && r.ok) { MODEL.off = null; S.ents.forEach(en => { en.modelNone = false; en.modelRetryAt = 0; }); setMsg('Game models are ready — monsters near the camera now show their models.'); setTimeout(() => setMsg(''), 5000); }
    else setMsg('Could not set up game models: ' + ((r && r.why) || 'no answer'));
  } catch (e) { setMsg('Could not set up game models: ' + e.message); }
  renderInfo();
}

// ---- buildings (owner 2026-10-17: "I miss all the buildings in all towns"): the map's StaticMeshActors around, one shared model per kind,
// drawn as instances; exported from the player's own client on first use (Dashboard/l2models_api.js), closest first, 4 at a time ----
const BLD = { group: null, gen: 0 };
/** are there real building models around (baked tiles with pieces)? then the ground is flattened under them (no walk-data walls) */
async function hasBuildings(me, r) { try { const d = await api(`/api/l2model/tiles?x=${Math.round(me.x)}&y=${Math.round(me.y)}&r=${Math.round(r)}`); return (d.tiles || []).some(t => t.pieces > 20); } catch (e) { return false; } }
// BAKED TILES (owner 2026-10-17: "cache it all ... load instant ... 1-2 draw calls"): above ground every 8192 tile is ONE mesh + ONE atlas,
// baked once on the server (docs/plan/tools/l2bake.js) and cached by the browser for good; tiles stay loaded while you move (max 9)
const TILES = { map: new Map(), busy: false, gen: 0 };
async function loadTiles(me, r) {
  const gen = ++TILES.gen;
  if (BLD.group) { R.scene.remove(BLD.group); BLD.group = null; }
  for (let round = 0; round < 200 && gen === TILES.gen && R; round++) {
    let d; try { d = await api(`/api/l2model/tiles?x=${Math.round(me.x)}&y=${Math.round(me.y)}&r=${Math.round(r + 1500)}`); } catch (e) { return; }
    if (gen !== TILES.gen || !R || !d) return;
    const want = new Set((d.tiles || []).map(t => t.key));
    TILES.map.forEach((m, k) => { if (!want.has(k) && TILES.map.size > 9) { R.scene.remove(m); m.geometry.dispose(); m.material.dispose(); TILES.map.delete(k); } });
    const todo = (d.tiles || []).filter(t => t.ready && !TILES.map.has(t.key + '@' + t.bin));
    await Promise.all(todo.map(async t => {
      try {
        const m = await loadBakedTile(t); if (gen !== TILES.gen || !R) { m.geometry.dispose(); m.material.dispose(); return; }
        TILES.map.forEach((old, k) => { if (k.split('@')[0] === t.key) { R.scene.remove(old); old.geometry.dispose(); old.material.dispose(); TILES.map.delete(k); } });   // a newer bake replaces the old one
        m.position.set(m.userData.tile.ox - S.ox, 0, m.userData.tile.oy - S.oy); m.frustumCulled = false; R.scene.add(m); TILES.map.set(t.key + '@' + t.bin, m);
        if (R.walls) R.walls.visible = false;
      } catch (e) { }
    }));
    const waiting = (d.tiles || []).filter(t => !t.ready).length;
    setMsg(waiting ? `Preparing buildings: ${waiting} area(s) — first visit, converting from your game client` : '');
    if (!waiting) return;
    await new Promise(res => setTimeout(res, 3000));
  }
}
async function loadBuildings(me, r) {
  if (!R || MODEL.off) return;
  if (!(me.z < -4500)) { BLD.gen++; return loadTiles(me, r); }   // above ground: baked tiles; underground: the per-model loader (filtered by floor height)
  TILES.gen++; TILES.map.forEach(m => { R.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); TILES.map.clear();
  const gen = ++BLD.gen;
  if (BLD.group) { R.scene.remove(BLD.group); BLD.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); }
  BLD.group = new THREE.Group(); R.scene.add(BLD.group);
  let d; try { d = await api(`/api/l2model/buildings?x=${Math.round(me.x)}&y=${Math.round(me.y)}&r=${Math.round(r + 1200)}`); } catch (e) { return; }
  if (gen !== BLD.gen || !R) return;
  const deep = me.z < -4500;
  const rows = (d.rows || []).filter(a => !deep || Math.abs(a[3] - me.z) < 1500);
  const byMesh = {}; rows.forEach(a => { (byMesh[a[0]] = byMesh[a[0]] || []).push(a); });
  const dist = (L) => Math.min(...L.map(a => Math.hypot(a[1] - me.x, a[2] - me.y)));
  const list = Object.entries(byMesh).sort((a, b) => dist(a[1]) - dist(b[1]));
  let done = 0; const total = list.length;
  const say = () => { if (gen === BLD.gen) setMsg(done < total ? `Loading buildings ${done}/${total}` : ''); };
  say();
  // batches of 60 names every 1.5 s (was one request per model); ready ones are drawn 6 at a time
  const byName = Object.fromEntries(list); let waiting = list.map(x => x[0]);
  BLD.stat = { started: 0, ok: 0, err: 0, last: '' };
  const draw = async (mesh, info) => {
    BLD.stat.started++;
    try {
      const st = await loadStatic(info); if (gen !== BLD.gen || !R) return;
      const L = byName[mesh], im = new THREE.InstancedMesh(st.geometry, st.materials, L.length);
      L.forEach((a, k) => im.setMatrixAt(k, placementMatrix(a, S.ox, S.oy)));
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; BLD.group.add(im);
      // the real buildings are here: the helper walls from the walk data only cluttered them (owner 2026-10-17, Giran screenshot)
      if (BLD.group.children.length >= 15 && R.walls) R.walls.visible = false;
      BLD.stat.ok++;
    } catch (e) { BLD.stat.err++; BLD.stat.last = String(e && e.message || e).slice(0, 120); }
  };
  for (let round = 0; round < 400 && waiting.length && gen === BLD.gen && R; round++) {
    const ready = [], still = [];
    for (let k = 0; k < waiting.length; k += 60) {
      const part = waiting.slice(k, k + 60); let ans = {};
      try { ans = await api('/api/l2model/statics?meshes=' + part.map(encodeURIComponent).join(',')); } catch (e) { }
      part.forEach(m => { const x = ans[m]; if (x && x.ok) ready.push([m, x]); else if (!x || x.pending) still.push(m); else done++; });
    }
    // a steady pool of 10 loads (was: groups of 6, each group waiting for its slowest)
    let next = 0; const worker = async () => { while (next < ready.length && gen === BLD.gen) { const [m, x] = ready[next++]; await draw(m, x); done++; if (done % 5 === 0) say(); } };
    await Promise.all(Array.from({ length: 10 }, worker));
    waiting = still; say();
    if (waiting.length) await new Promise(res => setTimeout(res, 1500));
  }

}

/** the floor under (x, y) nearest height z (the loaded ground grid; boss scripts put every guard at the boss's height, owner 2026-10-17:
 *  "monsters should be at the correct height" on Core's platforms) */
function groundAt(x, y, z) {
  const T = S.T; if (!T) return z;
  const i = Math.round((x - T.x0) / T.step), j = Math.round((y - T.y0) / T.step); let best = z, bd = 600;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= T.n || b >= T.n) continue;
    const h = T.H[b * T.n + a]; if (h === HOLE) continue;
    const d = Math.abs(h - z); if (d < bd) { bd = d; best = h; }
  }
  return best;
}
// ---- BOSS SCENE (owner 2026-10-17: "this 3D render under raid bosses ... all raid bosses and their minions where they are, with attack range,
// skills"; "select Core -> render Core in its throne room with all its minions"): #/view3d/boss:<npc id> ----
async function openBoss(id) {
  let d; try { d = await api('/api/view3d/scene?boss=' + id); } catch (e) { setMsg('Could not read the boss: ' + e.message); return; }
  if (!d || d.error) { S.boss = null; setMsg('Could not read the boss: ' + ((d && d.error) || 'no answer')); return; }
  if (!R) return;
  S.boss = d; const b = d.boss;
  S.me = { name: '', x: b.x, y: b.y, z: b.z, party: '' }; S.party = '';
  $id('v3dTitle').textContent = `3D view — ${b.name} (level ${b.level}${b.zone ? ', ' + b.zone : ''})`;
  await loadTerrain(S.me);
  if (!R) return;
  upsert('s:boss', { heading: b.heading, kind: 'mob', x: b.x, y: b.y, z: groundAt(b.x, b.y, b.z), label: b.name, sub: 'lvl ' + b.level + (b.aggressive ? ' · aggressive' : ''), hp: 100, color: 0xf0c040, big: true, m: { lvl: b.level } });
  d.minions.forEach((m, i) => upsert('s:min' + i, { kind: 'mob', x: m.x, y: m.y, z: groundAt(m.x, m.y, m.z), label: m.name, sub: 'lvl ' + m.lvl + ' · minion', hp: 100, color: 0xff7b3a, m: { lvl: m.lvl } }));
  d.room.forEach((m, i) => upsert('s:room' + i, { kind: 'mob', x: m.x, y: m.y, z: groundAt(m.x, m.y, m.z), label: m.name, sub: 'lvl ' + m.lvl + (m.aggressive ? ' · aggressive' : ''), hp: 100, color: m.aggressive ? 0xe24c4c : 0xd88a8a, m: { lvl: m.lvl } }));
  // range rings around the boss: aggro (red) and attack (orange, from its edge)
  const ring = (r, color, op) => { const g = new THREE.Mesh(new THREE.RingGeometry(Math.max(1, r - 6), r + 6, 96), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: op })); g.rotation.x = -Math.PI / 2; g.position.copy(P(b.x, b.y, b.z + 8)); R.scene.add(g); return g; };
  if (b.aggroRange) ring(b.aggroRange, 0xff3030, 0.55);
  ring((b.atkRange || 40) + (b.radius || 0), 0xffa030, 0.85);
  const p = P(b.x, b.y, b.z); R.controls.target.copy(p); R.camera.position.set(p.x, p.y + 900, p.z + 1100); S.follow = false; paintBar();
  renderInfo();
}
function bossCard() {
  const d = S.boss; if (!d) return '';
  const b = d.boss, cnt = {}; d.minions.forEach(m => { cnt[m.name] = (cnt[m.name] || 0) + 1; });
  const skills = (b.skills || []).filter(k => !/^(HP|MP) Increase|^Average |Standard Type|Type$|Creatures$|Resist /i.test(k.name));
  return `<div class="v3d-card"><b>${h(b.name)}</b> <span class="muted">level ${h(b.level)} · ${h(b.type || 'raid boss')}${b.zone ? ' · ' + h(b.zone) : ''}</span>
    <div>HP ${h(Math.round(b.hp || 0).toLocaleString())} · respawn ${h(b.respawn || '?')} · ${b.aggressive ? '<b class="bad">aggressive</b>' : 'not aggressive'}</div>
    <div><span style="color:#ff6060">●</span> aggro range ${h(b.aggroRange || 0)} · <span style="color:#ffa030">●</span> attack range ${h((b.atkRange || 40) + (b.radius || 0))} (from its centre)</div>
    ${Object.keys(cnt).length ? `<div><b>Minions:</b> ${Object.entries(cnt).map(([n, c]) => h(c + '× ' + n)).join(', ')}</div>` : ''}
    ${d.room.length ? `<div><b>Around it:</b> ${d.room.length} monsters (${h([...new Set(d.room.map(m => m.name))].slice(0, 6).join(', '))})</div>` : ''}
    ${skills.length ? `<div><b>Skills:</b> ${skills.map(k => h(k.name + (k.level > 1 ? ' ' + k.level : ''))).join(' · ')}</div>` : ''}
    <div class="muted">Tap a monster to see it · drag to turn · pinch / wheel to zoom</div></div>`;
}
