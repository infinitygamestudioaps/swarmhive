// BRAIN HOST — L2 entity look-alikes over the state mirror (2026-10-12, new engine phase 1; docs/plan/new_engine/DESIGN.md §3).
// L2Swarm hands scripts live .NET objects (L2User, L2Mob, L2Item, ...) and L2EntityCollection<T>. Here every entity is a VIEW over one
// plain data object of the mirror (updated in place by the agent's diffs, so a kept reference stays "live" like a host object).
// A field the mirror does not have is reported once to `missing` (kind.field) and reads as undefined — that list is the to-do list for
// agent2's state report. Long (.NET Int64) fields come back as BigInt when bigint=true (L2Swarm/ClearScript behaviour: swarm.js's num()
// copes; code that forgets it fails the same way as in L2Swarm).
'use strict';

const LONG_FIELDS = new Set(['Count', 'Price', 'Exp', 'DeadSinceMs', 'ReuseDelay', 'ReuseDelayRaw', 'Elapsed', 'ItemCount', 'ItemConsumeCount', 'LastUpdateTimestamp',
  'LastCombatHitReceivedMs', 'LastCombatAggroTargetedMs', 'LastCombatThreatRegisteredMs']);
// keys that JS machinery probes on any object (await, JSON, console, util.inspect, Symbol coercion): never "missing"
// names swarm.js only PROBES as an alternative spelling (x.NpcId !== undefined ? ... : x.Id, k.Description || k.Desc): undefined is the right answer
// IsQuestItem: agent2 reports it when L2Swarm's L2Item has it; otherwise undefined is what L2Swarm itself would give
const PROBES = new Set(['NpcId', 'Desc', 'ClanName', 'ZoneName', 'ClanId', 'TargetId', 'Enchant', 'EnchantLevel', 'IsQuestItem']);
const SILENT = new Set(['then', 'toJSON', 'constructor', 'inspect', 'valueOf', 'toString', 'nodeType', 'asymmetricMatch', '$$typeof', '__proto__', 'prototype', 'length',
  'catch', 'finally', 'ref', '_d', '_c', '_r']);

// TIMING (2026-10-12, audit #27): a skill on a known cooldown (mirror.js _cdAt + _cdRe) reads ready the moment that cooldown has run out on the
// brain clock, like L2Swarm's live L2Skill.IsReady, instead of 0-500 ms later with the agent's next readiness sample.
function skillReady(d, now) {
  if (d.IsReady !== false) return d.IsReady;
  const at = Number(d._cdAt) || 0, re = Number(d._cdRe) || 0;
  return at > 0 && re > 0 && now - at >= re ? true : false;
}
/** a skill row as L2Swarm's SnapshotJson gives it: live IsReady / Elapsed, no brain-private fields */
function skillPublic(d, now) {
  const r = {}; for (const k of Object.keys(d)) if (k[0] !== '_') r[k] = d[k];
  r.IsReady = skillReady(d, now); r.Elapsed = d._cdAt ? Math.max(0, now - d._cdAt) : Number(d.ReuseDelay) || 0;
  return r;
}
function makeViews(o) {
  const opts = Object.assign({ bigint: true, missing: null, me: () => null }, o || {});
  const cache = new WeakMap();               // data object -> proxy
  const info = new WeakMap();                // proxy -> { kind, d }
  const miss = (kind, k) => { if (opts.missing) opts.missing(kind + '.' + k); };
  const dist2 = (a, b) => Math.hypot((Number(a.X) || 0) - (Number(b.X) || 0), (Number(a.Y) || 0) - (Number(b.Y) || 0));
  // computed members shared by every entity kind
  function computed(kind, d, k) {
    switch (k) {
      case 'Point': return { X: Number(d.X) || 0, Y: Number(d.Y) || 0, x: Number(d.X) || 0, y: Number(d.Y) || 0 };
      case 'Point3D': return opts.point3d ? opts.point3d(d.X, d.Y, d.Z) : { X: d.X, Y: d.Y, Z: d.Z };
      case 'Distance': { const m = opts.me(); return m ? Math.round(dist2(d, m)) : 0; }
      case 'DistanceString': { const m = opts.me(); return String(m ? Math.round(dist2(d, m)) : 0); }
      case 'ToString': return () => String(d.Name || '');
      case 'toString': return () => String(d.Name || '');
      case 'ObjectType': return d.ObjectType || ({ mob: 'L2Mob', npc: 'L2Npc', char: 'L2Character', me: 'L2User', item: 'L2Item', skill: 'L2Skill', buff: 'L2Buff', party: 'L2PartyPpl', pet: 'L2PartyPet', drop: 'L2DroppedItem' })[kind];
      case 'IsWeapon': return () => /weapon/i.test(String(d.Type || '')) || d.BodyPart === 'R_HAND' || d.BodyPart === 'LR_HAND';
      case 'IsJewel': return () => /EAR|NECK|FINGER/.test(String(d.BodyPart || d.BodyPartTypes || ''));
      case 'IsSpoil': return () => /^spoil/i.test(String(d.Name || ''));
      case 'IsSweep': return () => /sweep/i.test(String(d.Name || ''));
      case 'IsResurrect': return () => /resurrect|restore life|soul of the phoenix/i.test(String(d.Name || ''));
      case 'HasAbnormalEffect': return () => !!(d.IsStunned || d.IsSleeping || d.IsParalyzed || d.IsOutOfControl);
      case 'CalculateExpPercents': return () => Number(d.ExpPercent) || 0;
      case 'SnapshotJson': return () => JSON.stringify(d);
      case 'GetSteps': return () => d.Steps || [];
      case 'Elapsed': return kind === 'skill' ? (t => (d._cdAt ? Math.max(0, (opts.now ? opts.now() : Date.now()) - d._cdAt) : Number(d.ReuseDelay) || 0))() : undefined;
      case 'Template': return kind === 'drop' ? { Id: d.Id, Name: d.Name } : undefined;
      case 'targetCrt': return opts.resolve && d.TargetObjId ? opts.resolve(d.TargetObjId) : null;
    }
    return undefined;
  }
  const HAS_COMPUTED = new Set(['Point', 'Point3D', 'Distance', 'DistanceString', 'ToString', 'toString', 'ObjectType', 'IsWeapon', 'IsJewel', 'IsSpoil', 'IsSweep', 'IsResurrect',
    'HasAbnormalEffect', 'CalculateExpPercents', 'SnapshotJson', 'GetSteps', 'targetCrt', 'Elapsed', 'Template']);
  function view(kind, d, extra) {
    if (!d || typeof d !== 'object') return null;
    let v = cache.get(d); if (v) return v;
    v = new Proxy(d, {
      get(t, k) {
        if (typeof k === 'symbol') return t[k];
        if (k === 'IsReady' && kind === 'skill' && 'IsReady' in t) return skillReady(t, opts.now ? opts.now() : Date.now());
        if (extra && Object.prototype.hasOwnProperty.call(extra, k)) { const e = extra[k]; return typeof e === 'function' && e.getter ? e() : e; }
        if (Object.prototype.hasOwnProperty.call(t, k)) {
          const val = t[k];
          if (opts.bigint && LONG_FIELDS.has(k) && typeof val === 'number' && Number.isInteger(val)) return BigInt(val);
          return val;
        }
        if (HAS_COMPUTED.has(k)) { const c = computed(kind, t, k); if (c !== undefined || k === 'Point3D' || (k === 'targetCrt' && 'TargetObjId' in t)) return c; }
        if (k === 'ItemId' && 'objId' in t && kind !== 'skill') return t.objId;
        if (PROBES.has(k)) return undefined;
        if (!SILENT.has(k)) miss(kind, k);
        return undefined;
      },
      set(t, k, val) { t[k] = val; return true; },          // swarm.js never writes host objects; harmless if it does (local only)
      has(t, k) { return k in t || HAS_COMPUTED.has(k) || !!(extra && k in extra); },
    });
    cache.set(d, v); info.set(v, { kind, d });
    return v;
  }
  return { view, info: (v) => (v && typeof v === 'object' ? info.get(v) : undefined), LONG_FIELDS };
}

// L2EntityCollection<T> look-alike: Count/length/Size, [i], forEach (stable snapshot), filter (new collection), GetItemBy*, Contains*,
// SnapshotJson (ours: crtType string) / snapshotJson (L2Swarm 3.8.10+: crtType number), SnapshotJsonNear(x, y, r).
function makeColl(getArr, toView, o) {
  const opts = Object.assign({ kind: '', creatures: false, missing: null, row: null }, o || {});   // row(d): the public copy of a data row (skills: skillPublic)
  const CT_NAME = ['Char', 'Npc', 'Mob', 'Summon', 'Pet', 'Unknown'];
  const arr = () => getArr() || [];
  const views = () => arr().map(toView);
  const json = (list, numeric) => JSON.stringify(list.map(d => {
    if (opts.row) return opts.row(d);
    if (!opts.creatures) return d;
    const c = Object.assign({}, d); c.crtType = numeric ? (Number(d.crtType) || 0) : (CT_NAME[Number(d.crtType) || 0] || 'Unknown'); return c;
  }));
  const api = {
    get Count() { return arr().length; }, get length() { return arr().length; }, get Size() { return arr().length; },
    forEach(cb) { const v = views(); for (let i = 0; i < v.length; i++) cb(v[i], i, coll); },
    filter(pred) { const keep = arr().filter((d, i) => { try { return pred(toView(d), i); } catch (e) { return false; } }); return makeColl(() => keep, toView, opts); },
    GetItemByObjectID(id) { const n = Number(id); const d = arr().find(x => Number(x.objId) === n); return d ? toView(d) : null; },
    GetItemByID(id) { const n = Number(id); const d = arr().find(x => Number(x.Id) === n); return d ? toView(d) : null; },
    GetItemByName(name) { const d = arr().find(x => x.Name === name); return d ? toView(d) : null; },
    GetItemByDisplayName(name) { const d = arr().find(x => (x.DisplayName || x.Name) === name); return d ? toView(d) : null; },
    ContainsObjectID(id) { const n = Number(id); return arr().some(x => Number(x.objId) === n); },
    ContainsID(id) { const n = Number(id); return arr().some(x => Number(x.Id) === n); },
    ContainsName(name) { return arr().some(x => x.Name === name); },
    ContainsDisplayName(name) { return arr().some(x => (x.DisplayName || x.Name) === name); },
    SnapshotJson() { return json(arr(), false); },
    snapshotJson() { return json(arr(), true); },
    SnapshotJsonNear(x, y, r) { const R = Number(r) || 0; return json(arr().filter(d => Math.hypot((d.X || 0) - x, (d.Y || 0) - y) <= R), false); },
    snapshotJsonNear(x, y, r) { const R = Number(r) || 0; return json(arr().filter(d => Math.hypot((d.X || 0) - x, (d.Y || 0) - y) <= R), true); },
    ToArray() { return views(); },
    [Symbol.iterator]: function* () { yield* views(); },
  };
  const coll = new Proxy(api, {
    get(t, k) {
      if (typeof k === 'string' && /^\d+$/.test(k)) { const d = arr()[Number(k)]; return d ? toView(d) : undefined; }
      if (k in t) return t[k];
      if (typeof k === 'string' && !SILENT.has(k) && opts.missing) opts.missing('Collection(' + opts.kind + ').' + k);
      return undefined;
    },
  });
  return coll;
}

module.exports = { makeViews, makeColl, LONG_FIELDS, skillReady, skillPublic };
