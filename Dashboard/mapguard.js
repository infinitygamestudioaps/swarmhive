// MAP GUARD (user 2026-10-09 12:45: "when you scroll and there is a map it auto-scrolls").
// Cause: every map that sits inside a scrolling page took the page's scroll for itself —
//   * mouse wheel: the character page map (charpage.js), the live party map (liveparty.js), the raid / town route editor (.redmap),
//     the zone editor (#zeMap), the room editor (#rmSvg) and the Leaflet world map (#map) all zoomed on EVERY wheel turn and called
//     preventDefault, so scrolling the page stopped dead the moment a map passed under the mouse and the map zoomed instead;
//   * touch: the same maps had CSS `touch-action: none` (Leaflet: its own drag), so a finger that started on a map panned the map
//     (and switched its "follow" off) instead of scrolling the page; a 300-460 px map on a phone was a trap.
// Fix (one place, no change inside the map modules): until the user clicks / taps INTO a map, the page keeps the gestures —
//   * wheel over an idle map scrolls the page (the map's own handler never sees it); Ctrl/⌘ + wheel (and a trackpad pinch) still zoom it;
//   * one finger over an idle map scrolls the page (touch-action pan-y), two fingers (pinch) still zoom it;
//   * a click / tap makes the map ACTIVE (gold outline): wheel zooms, one finger pans; clicking / tapping outside, the mouse leaving it or
//     a wheel turn elsewhere makes it idle again. A short hint says so ("Ctrl + scroll or click to zoom").
// Full-screen editors (spot editor, shape editor) are overlays without a page behind them: not guarded.
(function () {
  'use strict';
  const SEL = '.cp-mapwrap, #lpMap, .redmap, #zeMap, #map';
  const coarse = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  let active = null, hintEl = null, hintT = 0;
  const mapOf = (t) => (t && t.nodeType === 1 && t.closest) ? t.closest(SEL) : (t && t.parentElement ? t.parentElement.closest(SEL) : null);
  // index.html keeps the Leaflet map in a top-level 'let MAP' (a global binding, not a window property)
  const lmap = () => { try { return typeof MAP !== 'undefined' && MAP ? MAP : (window.MAP || null); } catch (e) { return null; } };
  function leafletSync() {
    const M = lmap(), el = document.getElementById('map');
    if (!M || !el || !M.scrollWheelZoom) return;
    const on = active === el;
    try { if (on) M.scrollWheelZoom.enable(); else M.scrollWheelZoom.disable(); } catch (e) { }
    try { if (coarse()) { if (on) M.dragging.enable(); else M.dragging.disable(); } else if (!M.dragging.enabled()) M.dragging.enable(); } catch (e) { }
  }
  function setActive(el) {
    if (active === el) return;
    if (active) active.classList.remove('mg-on');
    active = el;
    if (el) { el.classList.add('mg-on'); if (coarse()) hint(el, 'Map active: drag to move, two fingers to zoom. Tap outside the map to scroll the page.'); }
    leafletSync();
  }
  function hint(el, text) {
    if (!hintEl) { hintEl = document.createElement('div'); hintEl.className = 'mg-hint'; hintEl.setAttribute('role', 'status'); document.body.appendChild(hintEl); }
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    hintEl.textContent = text;
    const top = Math.max(8, Math.min(window.innerHeight - 50, r.top + Math.min(r.height, window.innerHeight) / 2 - 18));
    hintEl.style.top = top + 'px'; hintEl.style.left = Math.max(8, r.left + r.width / 2) + 'px';
    hintEl.classList.add('on');
    clearTimeout(hintT); hintT = setTimeout(() => hintEl.classList.remove('on'), 1600);
  }
  // ---- wheel: the page scrolls unless the map is active or Ctrl / ⌘ is held
  window.addEventListener('wheel', (e) => {
    const m = mapOf(e.target);
    if (active && m !== active) setActive(null);                     // scrolling somewhere else: the active map lets go
    if (!m) return;
    if (m === active) return;                                        // the map zooms (its own handler)
    if (e.ctrlKey || e.metaKey) {
      if (m.id === 'map' && lmap() && lmap().setZoomAround) {  // Leaflet keeps its wheel zoom off while idle: zoom here
        e.preventDefault(); e.stopImmediatePropagation();
        try { const M = lmap(); M.setZoomAround(M.mouseEventToContainerPoint(e), M.getZoom() + (e.deltaY < 0 ? 0.5 : -0.5)); } catch (er) { }
      }
      return;                                                        // other maps: their handler zooms (and stops the browser zoom)
    }
    e.stopImmediatePropagation();                                    // nobody below sees it: no map zoom, the browser scrolls the page
    hint(m, /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘ + scroll or click the map to zoom it' : 'Ctrl + scroll or click the map to zoom it');
  }, { capture: true, passive: false });
  // ---- pointers: a click / tap activates, one finger on an idle map never pans it
  const touches = new Map();
  window.addEventListener('pointerdown', (e) => {
    const m = mapOf(e.target);
    if (!m) { if (active) setActive(null); return; }
    if (m !== active && active) setActive(null);
    if (e.pointerType === 'mouse' && !coarse()) { setActive(m); return; }   // a mouse on a PC: a press in the map = it is yours (drag pans at once)
    touches.set(e.pointerId, { m, x: e.clientX, y: e.clientY, moved: 0 });
  }, true);
  const onMap = (m) => { let n = 0; touches.forEach(t => { if (t.m === m) n++; }); return n; };
  window.addEventListener('pointermove', (e) => {
    const t = touches.get(e.pointerId); if (!t) return;            // (touch, pen, or any pointer on a touch screen)
    t.moved = Math.max(t.moved, Math.hypot(e.clientX - t.x, e.clientY - t.y));
    if (t.m !== active && onMap(t.m) < 2) {                         // one finger on an idle map: the page's gesture, not a map pan
      e.stopImmediatePropagation();
      if (t.moved > 14 && !t.hinted) { t.hinted = true; hint(t.m, 'Tap the map to move it · two fingers to zoom'); }
    }
  }, true);
  const end = (e) => {
    const t = touches.get(e.pointerId); touches.delete(e.pointerId);
    if (t && e.type === 'pointerup' && t.moved < 10 && t.m !== active) setActive(t.m);   // a tap = activate
  };
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
  // the mouse leaving the active map hands the wheel back to the page
  window.addEventListener('pointerout', (e) => {
    if (!active || e.pointerType !== 'mouse' || coarse()) return;
    const to = e.relatedTarget;
    if (mapOf(e.target) === active && (!to || mapOf(to) !== active)) setActive(null);
  }, true);
  // a map that is re-rendered / hidden is never left "active"
  setInterval(() => { if (active && (!active.isConnected || !active.offsetParent)) setActive(null); const M = lmap(); if (M && !M._mgDone) { M._mgDone = true; leafletSync(); } }, 1000);
  window.MapGuard = { active: () => active, release: () => setActive(null), SEL };
})();
