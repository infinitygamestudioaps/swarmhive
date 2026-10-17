// L2 MODEL LOADER (3D view, owner 2026-10-17: "character models and enemies"): reads the ActorX files UE Viewer exports from the player's own
// client (Dashboard/l2models_api.js) and builds a three.js SkinnedMesh + AnimationClips.
//   .psk = points, wedges (point + uv + material), faces, materials, reference skeleton, raw weights
//   .psa = bone names, sequences (name, frames, rate), keys (position + rotation per bone per frame)
// Axes: Unreal is left-handed with Z up; the 3D view maps world (x, y, z) -> scene (x, z, y) (a mirror), so the model uses the SAME mapping:
// positions (x, z, y), rotations (-x, -z, -y, w), triangle order reversed. ActorX stores every bone rotation except the root's conjugated.
import * as THREE from './vendor/three.module.min.js';

function chunks(buf) {
  const dv = new DataView(buf), out = {}; let o = 0;
  const td = new TextDecoder('latin1');
  while (o + 32 <= buf.byteLength) {
    const id = td.decode(new Uint8Array(buf, o, 20)).replace(/\0.*$/, '');
    const size = dv.getInt32(o + 24, true), count = dv.getInt32(o + 28, true);
    out[id] = { off: o + 32, size, count };
    o += 32 + size * count;
  }
  return { dv, out, td };
}
const name64 = (td, buf, o) => td.decode(new Uint8Array(buf, o, 64)).replace(/\0.*$/, '').trim();
/** Unreal (x, y, z) -> scene; a rotation (x, y, z, w) -> scene, conjugated for every bone but the root */
const pos = (x, y, z) => new THREE.Vector3(x, z, y);
function rot(x, y, z, w, isRoot) { if (!isRoot) { x = -x; y = -y; z = -z; } return new THREE.Quaternion(-x, -z, -y, w); }

export function parsePsk(buf) {
  const { dv, out, td } = chunks(buf);
  const P = out.PNTS0000, W = out.VTXW0000, F = out.FACE0000 || out.FACE3200, B = out.REFSKELT || out.REFSKEL0, R = out.RAWWEIGHTS || out.RAWW0000, M = out.MATT0000;
  if (!P || !W || !F || !B) throw new Error('not a skeletal .psk');
  const pts = []; for (let i = 0; i < P.count; i++) { const o = P.off + i * P.size; pts.push(pos(dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true))); }
  const big = P.count > 65536;
  const wedges = []; for (let i = 0; i < W.count; i++) { const o = W.off + i * W.size; wedges.push({ p: big ? dv.getUint32(o, true) : dv.getUint16(o, true), u: dv.getFloat32(o + 4, true), v: dv.getFloat32(o + 8, true), m: dv.getUint8(o + 12) }); }
  const faces = []; const f32 = F.size >= 18;
  for (let i = 0; i < F.count; i++) { const o = F.off + i * F.size; const a = f32 ? dv.getUint32(o, true) : dv.getUint16(o, true), b = f32 ? dv.getUint32(o + 4, true) : dv.getUint16(o + 2, true), c = f32 ? dv.getUint32(o + 8, true) : dv.getUint16(o + 4, true); faces.push([a, c, b, dv.getUint8(o + (f32 ? 12 : 6))]); }
  const bones = []; for (let i = 0; i < B.count; i++) { const o = B.off + i * B.size; bones.push({ name: name64(td, buf, o), parent: dv.getInt32(o + 72, true), q: rot(dv.getFloat32(o + 76, true), dv.getFloat32(o + 80, true), dv.getFloat32(o + 84, true), dv.getFloat32(o + 88, true), i === 0), p: pos(dv.getFloat32(o + 92, true), dv.getFloat32(o + 96, true), dv.getFloat32(o + 100, true)) }); }
  const inf = pts.map(() => []);
  if (R) for (let i = 0; i < R.count; i++) { const o = R.off + i * R.size; const w = dv.getFloat32(o, true), p = dv.getInt32(o + 4, true), b = dv.getInt32(o + 8, true); if (inf[p]) inf[p].push([b, w]); }
  const mats = []; if (M) for (let i = 0; i < M.count; i++) mats.push(name64(td, buf, M.off + i * M.size));
  return { pts, wedges, faces, bones, inf, mats };
}
export function parsePsa(buf) {
  const { dv, out, td } = chunks(buf);
  const BN = out.BONENAMES, AI = out.ANIMINFO, AK = out.ANIMKEYS;
  if (!BN || !AI || !AK) throw new Error('not a .psa');
  const names = []; for (let i = 0; i < BN.count; i++) names.push(name64(td, buf, BN.off + i * BN.size));
  const seqs = []; for (let i = 0; i < AI.count; i++) { const o = AI.off + i * AI.size; seqs.push({ name: name64(td, buf, o), bones: dv.getInt32(o + 128, true), rate: dv.getFloat32(o + 152, true), first: dv.getInt32(o + 160, true), frames: dv.getInt32(o + 164, true) }); }
  return { names, seqs, key: (i) => { const o = AK.off + i * AK.size; return [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true), dv.getFloat32(o + 12, true), dv.getFloat32(o + 16, true), dv.getFloat32(o + 20, true), dv.getFloat32(o + 24, true)]; } };
}
/** psk (+ psa, textures) -> { object, mixer, clips: { name: AnimationClip } } */
export function build(psk, psa, textures) {
  const { pts, wedges, faces, bones, inf } = psk;
  // the mesh: one vertex per wedge; faces grouped by material
  const posA = new Float32Array(wedges.length * 3), uvA = new Float32Array(wedges.length * 2), siA = new Uint16Array(wedges.length * 4), swA = new Float32Array(wedges.length * 4);
  wedges.forEach((w, i) => {
    const p = pts[w.p]; posA.set([p.x, p.y, p.z], i * 3); uvA.set([w.u, w.v], i * 2);
    const L = (inf[w.p] || []).slice().sort((a, b) => b[1] - a[1]).slice(0, 4), s = L.reduce((t, x) => t + x[1], 0) || 1;
    L.forEach(([b, wt], k) => { siA[i * 4 + k] = b; swA[i * 4 + k] = wt / s; });
    if (!L.length) swA[i * 4] = 1;
  });
  const byMat = {}; faces.forEach(f => { (byMat[f[3]] = byMat[f[3]] || []).push(f[0], f[1], f[2]); });
  const idx = [], g = new THREE.BufferGeometry(); let start = 0;
  const matIds = Object.keys(byMat).map(Number).sort((a, b) => a - b);
  matIds.forEach((m, gi) => { idx.push(...byMat[m]); g.addGroup(start, byMat[m].length, gi); start += byMat[m].length; });
  g.setAttribute('position', new THREE.BufferAttribute(posA, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(siA, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(swA, 4));
  g.setIndex(idx); g.computeVertexNormals();
  // SOLID (owner 2026-10-17 screenshots: Orfen / Antharas / Guard Ant full of holes): L2 textures keep a SHINE mask in the alpha channel, so
  // the alpha is ignored; only foliage / hair / fur materials (by name) are cut out
  const CUT = /tree|leaf|leav|grass|bush|branch|plant|flower|fence|ivy|vine|fern|weed|hair|_ah|_bh|fur|feather|wing|web/i;
  const materials = matIds.map(m => { const t = textures[m] || textures[0] || null, nm = (psk.mats && psk.mats[m]) || ''; return new THREE.MeshLambertMaterial({ map: t, color: t ? 0xffffff : 0x9a8f80, side: THREE.DoubleSide, alphaTest: CUT.test(nm) ? 0.5 : 0 }); });
  // the skeleton (bind pose)
  const B = bones.map((b, i) => { const o = new THREE.Bone(); o.name = 'b' + i; o.position.copy(b.p); o.quaternion.copy(b.q); return o; });
  bones.forEach((b, i) => { if (i > 0 && b.parent >= 0 && b.parent !== i && B[b.parent]) B[b.parent].add(B[i]); });
  const root = new THREE.Group(); root.add(B[0]);
  const mesh = new THREE.SkinnedMesh(g, materials); root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(B));
  mesh.frustumCulled = false;
  // animations: one clip per sequence (bones matched by name)
  const clips = {};
  if (psa) {
    const map = psa.names.map(n => bones.findIndex(b => b.name.toLowerCase() === n.toLowerCase()));
    psa.seqs.forEach(s => {
      if (!s.frames || !s.rate) return;
      const tracks = [], times = new Float32Array(s.frames); for (let f = 0; f < s.frames; f++) times[f] = f / s.rate;
      for (let bi = 0; bi < psa.names.length; bi++) {
        const k = map[bi]; if (k < 0) continue;
        const pv = new Float32Array(s.frames * 3), qv = new Float32Array(s.frames * 4);
        for (let f = 0; f < s.frames; f++) {
          const K = psa.key((s.first + f) * psa.names.length + bi), p = pos(K[0], K[1], K[2]), q = rot(K[3], K[4], K[5], K[6], k === 0);
          pv.set([p.x, p.y, p.z], f * 3); qv.set([q.x, q.y, q.z, q.w], f * 4);
        }
        tracks.push(new THREE.VectorKeyframeTrack(`b${k}.position`, times, pv), new THREE.QuaternionKeyframeTrack(`b${k}.quaternion`, times, qv));
      }
      clips[s.name] = new THREE.AnimationClip(s.name, s.frames / s.rate, tracks);
    });
  }
  const mixer = new THREE.AnimationMixer(root);
  return { object: root, mesh, mixer, clips };
}
/** the clip for a state: idle | run | walk | attack | death | cast */
export function clipFor(clips, state) {
  const names = Object.keys(clips);
  const RE = { idle: /^(wait|idle|stand|breath)/i, run: /^run/i, walk: /^walk/i, attack: /^(atk|attack)/i, death: /^(death|dead|die)/i, cast: /^(cast|spell|magic|skill)/i };
  const n = names.find(x => RE[state] && RE[state].test(x)) || (state !== 'idle' ? null : names[0]);
  return n ? clips[n] : null;
}
const cache = new Map();
/** fetch + parse + build one model (urls from /api/l2model/npc); the parsed files are cached, every call gets its own copy */
export async function loadModel(info) {
  const key = info.mesh;
  let base = cache.get(key);
  if (!base) {
    base = (async () => {
      const [pskBuf, psaBuf] = await Promise.all([fetch(info.mesh).then(r => r.arrayBuffer()), info.anim ? fetch(info.anim).then(r => r.arrayBuffer()).catch(() => null) : null]);
      const loader = new THREE.TextureLoader();
      const tex = await Promise.all((info.tex || []).map(u => u ? new Promise(res => loader.load(u, t => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null))) : null));
      return { psk: parsePsk(pskBuf), psa: psaBuf ? parsePsa(psaBuf) : null, tex };
    })();
    cache.set(key, base);
  }
  const b = await base;
  return build(b.psk, b.psa, b.tex);
}

// ---- characters: several parts (upper / lower / gloves / boots / face / hair) on ONE skeleton ----------------------------------------------
/** parts [{ psk, tex[] }] + psa -> { object, mesh (first part), mixer, clips }; every part's bones are matched by name to the part with most bones */
export function buildChar(parts, psa) {
  const base = parts.slice().sort((a, b) => b.psk.bones.length - a.psk.bones.length)[0].psk;
  const bones = base.bones;
  const B = bones.map((b, i) => { const o = new THREE.Bone(); o.name = 'b' + i; o.position.copy(b.p); o.quaternion.copy(b.q); return o; });
  bones.forEach((b, i) => { if (i > 0 && b.parent >= 0 && b.parent !== i && B[b.parent]) B[b.parent].add(B[i]); });
  const root = new THREE.Group(); root.add(B[0]); root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(B);
  const byName = {}; bones.forEach((b, i) => { byName[b.name.toLowerCase()] = i; });
  let first = null;
  parts.forEach(({ psk, tex }) => {
    const remap = psk.bones.map(b => { const k = byName[b.name.toLowerCase()]; return k == null ? 0 : k; });
    const one = build({ ...psk, bones: psk.bones }, null, tex);
    const g = one.mesh.geometry, si = g.getAttribute('skinIndex');
    for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) si.setComponent(i, c, remap[si.getComponent(i, c)] || 0);
    si.needsUpdate = true;
    const m = new THREE.SkinnedMesh(g, one.mesh.material); m.frustumCulled = false;
    root.add(m); m.bind(skeleton, new THREE.Matrix4());
    if (!first) first = m;
  });
  const clips = {};
  if (psa) {
    const map = psa.names.map(n => { const k = byName[n.toLowerCase()]; return k == null ? -1 : k; });
    psa.seqs.forEach(s => {
      if (!s.frames || !s.rate) return;
      const tracks = [], times = new Float32Array(s.frames); for (let f = 0; f < s.frames; f++) times[f] = f / s.rate;
      for (let bi = 0; bi < psa.names.length; bi++) {
        const k = map[bi]; if (k < 0) continue;
        const pv = new Float32Array(s.frames * 3), qv = new Float32Array(s.frames * 4);
        for (let f = 0; f < s.frames; f++) { const K = psa.key((s.first + f) * psa.names.length + bi), p = pos(K[0], K[1], K[2]), q = rot(K[3], K[4], K[5], K[6], k === 0); pv.set([p.x, p.y, p.z], f * 3); qv.set([q.x, q.y, q.z, q.w], f * 4); }
        tracks.push(new THREE.VectorKeyframeTrack(`b${k}.position`, times, pv), new THREE.QuaternionKeyframeTrack(`b${k}.quaternion`, times, qv));
      }
      clips[s.name] = new THREE.AnimationClip(s.name, s.frames / s.rate, tracks);
    });
  }
  const boneByName = {}; bones.forEach((b, i) => { boneByName[b.name.toLowerCase()] = B[i]; });
  return { object: root, mesh: first, mixer: new THREE.AnimationMixer(root), clips, boneByName };
}
const charCache = new Map();
/** /api/l2model/char answer -> an animated character (parsed files cached per url) */
export async function loadCharacter(info) {
  const getPsk = (u) => { if (!charCache.has(u)) charCache.set(u, fetch(u).then(r => r.arrayBuffer()).then(parsePsk)); return charCache.get(u); };
  const getPsa = (u) => { if (!u) return Promise.resolve(null); if (!charCache.has(u)) charCache.set(u, fetch(u).then(r => r.arrayBuffer()).then(parsePsa).catch(() => null)); return charCache.get(u); };
  const loader = new THREE.TextureLoader();
  const getTex = (u) => { if (!u) return Promise.resolve(null); if (!charCache.has(u)) charCache.set(u, new Promise(res => loader.load(u, t => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null)))); return charCache.get(u); };
  const parts = await Promise.all(info.parts.map(async p => ({ psk: await getPsk(p.mesh), tex: await Promise.all((p.tex || []).map(getTex)) })));
  const md = buildChar(parts, await getPsa(info.anim));
  // weapons / shields: a static copy of the held model on its attachment bone (Weapon_R_Bone, Weapon_L_Bone, Shield_L_Bone)
  for (const h of (info.held || [])) {
    try {
      const bone = md.boneByName[String(h.bone).toLowerCase()]; if (!bone) continue;
      const psk = await getPsk(h.mesh), tex = await Promise.all((h.tex || []).map(getTex));
      const st = buildStatic(psk, tex), mesh = new THREE.Mesh(st.geometry, st.materials); mesh.frustumCulled = false; mesh.userData.held = h.bone;
      bone.add(mesh);
    } catch (e) { }
  }
  return md;
}

// ---- buildings (static meshes from the map files) ----------------------------------------------------------------------------------------
/** .pskx (no skeleton) -> { geometry, materials } in scene axes (shared by every copy of that building) */
export function buildStatic(psk, textures) {
  const { pts, wedges, faces } = psk;
  const posA = new Float32Array(wedges.length * 3), uvA = new Float32Array(wedges.length * 2);
  wedges.forEach((w, i) => { const p = pts[w.p]; posA.set([p.x, p.y, p.z], i * 3); uvA.set([w.u, w.v], i * 2); });
  const byMat = {}; faces.forEach(f => { (byMat[f[3]] = byMat[f[3]] || []).push(f[0], f[1], f[2]); });
  const idx = [], g = new THREE.BufferGeometry(); let start = 0;
  const matIds = Object.keys(byMat).map(Number).sort((a, b) => a - b);
  matIds.forEach((m, gi) => { idx.push(...byMat[m]); g.addGroup(start, byMat[m].length, gi); start += byMat[m].length; });
  g.setAttribute('position', new THREE.BufferAttribute(posA, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const CUT = /tree|leaf|leav|grass|bush|branch|plant|flower|fence|ivy|vine|fern|weed|net|web|chain|rope|grill|grate|bars/i;   // foliage etc. cut out, everything else solid (shine mask in alpha)
  const materials = matIds.map(m => { const t = textures[m] || null, nm = (psk.mats && psk.mats[m]) || ''; return new THREE.MeshLambertMaterial({ map: t, color: t ? 0xffffff : 0x8a8478, side: THREE.DoubleSide, alphaTest: CUT.test(nm) ? 0.5 : 0 }); });
  return { geometry: g, materials };
}
const staticCache = new Map();
/** /api/l2model/static answer -> { geometry, materials } (cached per mesh url) */
export function loadStatic(info) {
  if (staticCache.has(info.mesh)) return staticCache.get(info.mesh);
  const loader = new THREE.TextureLoader();
  const p = (async () => {
    const psk = parsePsk(await fetch(info.mesh).then(r => r.arrayBuffer()));
    const tex = await Promise.all((info.mats || []).map(u => u ? new Promise(res => loader.load(u, t => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; res(t); }, undefined, () => res(null))) : null));
    return buildStatic(psk, tex);
  })();
  staticCache.set(info.mesh, p);
  return p;
}
/** a placement [mesh, x, y, z, pitch, yaw, roll, sx, sy, sz] (Unreal) -> its scene matrix (world mapping x, z, y; minus the view origin) */
export function placementMatrix(a, ox, oy) {
  const U = Math.PI * 2 / 65536, P = a[4] * U, Y = a[5] * U, R = a[6] * U;
  const SP = Math.sin(P), CP = Math.cos(P), SY = Math.sin(Y), CY = Math.cos(Y), SR = Math.sin(R), CR = Math.cos(R);
  // Unreal FRotationMatrix rows (row vectors): X, Y, Z axes; scale per axis; then the mirror (y <-> z) on both sides
  const X = [CP * CY * a[7], CP * SY * a[7], SP * a[7]], Yv = [(SR * SP * CY - CR * SY) * a[8], (SR * SP * SY + CR * CY) * a[8], -SR * CP * a[8]], Z = [-(CR * SP * CY + SR * SY) * a[9], (CY * SR - CR * SP * SY) * a[9], CR * CP * a[9]];
  const sw = (v) => new THREE.Vector3(v[0], v[2], v[1]);
  // columns of the scene matrix: scene x-axis = mirrored UE X axis, scene y-axis (= UE Z) = mirrored UE Z axis, scene z-axis (= UE Y) = mirrored UE Y axis
  const m = new THREE.Matrix4().makeBasis(sw(X), sw(Z), sw(Yv));
  m.setPosition(a[1] - ox, a[3], a[2] - oy);
  return m;
}
