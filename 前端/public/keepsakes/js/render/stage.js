// Stage: one WebGL canvas over a paper-and-ink backdrop. The world turns in your hand; the sky stays put.
import { THREE, ease } from './kit.js';
import { rngFor } from '../engine/codec.js';

export function createStage(host, { transparent = true } = {}) {
  host.classList.add('stage');
  const back = document.createElement('div'); back.className = 'stage-back';
  const orn = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); orn.setAttribute('class', 'stage-ornament'); orn.setAttribute('viewBox', '0 0 100 100'); orn.setAttribute('preserveAspectRatio', 'xMidYMid meet'); orn.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas'); canvas.className = 'stage-canvas';
  host.append(back, orn, canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent, preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  // Soft shadows: renderers opt in per light (castShadow) and per mesh.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  const pivot = new THREE.Group(); // user rotation is applied here
  scene.add(pivot);

  let lastBackdrop = null;
  let current = null, dist = 6, zoom = 1, running = true, last = performance.now(), autoSpin = 0.12, idleFor = 99;
  // Screen space taken by overlays (a caption card, a toolbar). The object is framed in what is left.
  let inset = { top: 0, bottom: 0 };
  const insetNow = { top: 0, bottom: 0 };
  // 'hang' framing (a charm on a hook): a vertical drag looks a little from above or below, then settles.
  const tilt = { a: 0, v: 0, target: 0 };
  const tweens = [];
  const vel = { x: 0, y: 0 };

  function size() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    applyView();
  }
  // Shift the picture so the object sits in the middle of the free space, and fit it there.
  function applyView() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    const off = (insetNow.bottom - insetNow.top) / 2;
    if (Math.abs(off) > 0.5) camera.setViewOffset(w, h, 0, off, w, h); else camera.clearViewOffset();
    dist = fitDist(fr().dist);
    placeCamera();
  }
  // Each renderer may frame itself: { dist, objectDist, camY, lookY, fitAspect }.
  const fr = () => ({ dist: 6.2, objectDist: 4.6, camY: 0.42, lookY: 0, fitAspect: true, ...(current?.frame || {}) });
  const fitDist = (d, free = freeShare()) => {
    const f = fr();
    let out = f.fitAspect ? d / Math.min(1, camera.aspect * 1.25) : d / Math.min(1, camera.aspect * 2.2);
    out = Math.max(out, d / free);
    // wide objects (a globe) must fit across a narrow phone screen
    if (f.halfWidth) out = Math.max(out, f.halfWidth / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect) * 1.05);
    return out;
  };
  function freeShare() { const h = host.clientHeight || 1; return Math.max(0.42, (h - insetNow.top - insetNow.bottom) / h); }
  function placeCamera() {
    const f = fr(), r = dist * zoom;
    // tilt: look from a little above or below, on an arc around the point we look at
    const el = Math.atan2(f.camY * zoom - f.lookY, r) + tilt.a;
    camera.position.set(0, f.lookY + Math.sin(el) * Math.hypot(r, f.camY * zoom - f.lookY), Math.cos(el) * Math.hypot(r, f.camY * zoom - f.lookY));
    camera.lookAt(0, f.lookY, 0); camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(size); ro.observe(host);

  /* -------- input: drag to turn, pinch / wheel to zoom, tap to pick -------- */
  const ptrs = new Map();
  let drag = null, pinch = null, downAt = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; drag = null; }
    idleFor = 0;
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; zoom = clampZ(pinch.z * pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))); placeCamera(); return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    const k = 4.2 / Math.max(300, host.clientHeight);
    idleFor = 0;
    if (fr().turn === 'hang') {
      // A hanging charm is not a turntable: the object twists from its hook (the renderer owns that motion),
      // and a vertical drag only tilts the view a little.
      current?.drag?.(dx * k * 0.7, dy * k, { hang: true });
      tilt.target = Math.max(-0.22, Math.min(0.32, tilt.target + dy * k * 0.35));
      return;
    }
    vel.x = dx * k; vel.y = dy * k;
    turn(vel.x, vel.y);
    current?.drag?.(vel.x, vel.y);
  });
  // Hovering with a mouse brushes past parts that respond to touch (e.g. a bead swings).
  let lastHover = null, hoverAt = 0, hx = 0;
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons || !current?.touch) return;
    const now = performance.now(), dx = e.clientX - hx; hx = e.clientX;
    if (now - hoverAt < 40) return; hoverAt = now;
    const what = pickAt(e);
    if (what && what !== lastHover) current.touch(what, Math.min(1.6, 0.4 + Math.abs(dx) / 12), Math.sign(dx));
    lastHover = what;
  });
  const end = e => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      drag = null;
      current?.release?.();
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8 && performance.now() - downAt.t < 700) tap(e);
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; current?.release?.(); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = clampZ(zoom * (1 + e.deltaY * 0.001)); placeCamera(); }, { passive: false });
  const clampZ = z => Math.min(1.5, Math.max(0.45, z));
  const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  function turn(ax, ay) {
    if (fr().turn === 'y') ay = 0;
    qy.setFromAxisAngle(Y, ax); qx.setFromAxisAngle(X, ay);
    pivot.quaternion.premultiply(qy).premultiply(qx);
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let onPick = null;
  function pickAt(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(pivot.children, true)) {
      if (!h.object.visible) continue;
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o.userData.pick;
    }
    return null;
  }
  function tap(e) {
    const what = pickAt(e);
    current?.touch?.(what, 1.3); // even an empty spot: e.g. a tap on the glass shakes the globe
    if (what) onPick?.(what);
  }

  /* -------- loop -------- */
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    idleFor += dt;
    const hang = fr().turn === 'hang';
    if (!drag && !hang) {
      vel.x *= 0.92; vel.y *= 0.92;
      if (Math.abs(vel.x) + Math.abs(vel.y) > 0.0004) turn(vel.x, vel.y);
      else if (idleFor > 2.5 && autoSpin) turn(autoSpin * dt * Math.min(1, (idleFor - 2.5) / 2), 0);
    }
    // overlays move smoothly, so the object glides out of their way
    const ki = 1 - Math.exp(-7 * dt);
    let moved = false;
    for (const s of ['top', 'bottom']) { const d = inset[s] - insetNow[s]; if (Math.abs(d) > 0.3) { insetNow[s] += d * ki; moved = true; } else if (d) { insetNow[s] = inset[s]; moved = true; } }
    if (hang) {
      if (!drag) tilt.target *= Math.exp(-1.6 * dt);
      const n = Math.ceil(dt / 0.008), hh = dt / n;
      for (let i = 0; i < n; i++) { tilt.v += (-40 * (tilt.a - tilt.target) - 11 * tilt.v) * hh; tilt.a += tilt.v * hh; }
      if (Math.abs(tilt.v) > 1e-4 || Math.abs(tilt.a - tilt.target) > 1e-4) moved = true;
    }
    if (moved) applyView();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      if (tw.t < tw.delay) continue;
      const k = Math.min(1, (tw.t - tw.delay) / tw.dur);
      tw.fn(tw.ease(k));
      if (k >= 1) { tweens.splice(i, 1); tw.done(); }
    }
    current?.update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(t => { last = t; size(); frame(t); });

  /* -------- api -------- */
  return {
    host, renderer, scene, camera, pivot,
    set onPick(fn) { onPick = fn; },
    set autoSpin(v) { autoSpin = v; },
    setWorld(api, { keepRotation = false } = {}) {
      if (current) { pivot.remove(current.world); scene.remove(current.skyLayer); current.dispose?.(); }
      current = api;
      if (!api) return;
      pivot.add(api.world); scene.add(api.skyLayer);
      zoom = 1; tilt.a = tilt.v = tilt.target = 0; size();
      if (lastBackdrop) this.backdrop(...lastBackdrop); // the backdrop style belongs to the object
      if (!keepRotation) { pivot.quaternion.identity(); turn(0, api.frame ? 0 : 0.18); }
    },
    backdrop(bg, dark, seed = 'x', ink = '#6B6386') {
      lastBackdrop = [bg, dark, seed, ink];
      host.style.setProperty('--sky-a', bg[0]);
      host.style.setProperty('--sky-b', bg[1]);
      host.classList.toggle('is-dark', !!dark);
      drawOrnament(orn, seed, ink, dark, fr().ornament || 'starry');
    },
    /** Reserve screen space for overlays ({top, bottom} in CSS pixels); the object glides into the space left. */
    setInsets({ top = 0, bottom = 0 } = {}, { instant = false } = {}) {
      inset = { top: Math.max(0, top), bottom: Math.max(0, bottom) };
      if (instant) { insetNow.top = inset.top; insetNow.bottom = inset.bottom; applyView(); }
    },
    tween(dur, fn, e = ease.outCubic, delay = 0) {
      return new Promise(done => tweens.push({ dur, fn, ease: e, delay, t: 0, done }));
    },
    /** Turn the world so a local direction faces the viewer. */
    focus(dir, dur = 1.2) {
      const from = pivot.quaternion.clone();
      const want = new THREE.Vector3(0, 0.25, 1).normalize();
      const to = new THREE.Quaternion().setFromUnitVectors(dir.clone().normalize(), want);
      idleFor = -dur;
      vel.x = vel.y = 0;
      return this.tween(dur, k => pivot.quaternion.slerpQuaternions(from, to, k), ease.inOut);
    },
    /** PNG of the current view at a given size (transparent background). */
    capture(w = 1024, h = 1024, { object = false } = {}) {
      const ow = renderer.domElement.width, oh = renderer.domElement.height, oa = camera.aspect, pr = renderer.getPixelRatio();
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.clearViewOffset(); dist = fitDist(object ? fr().objectDist : fr().dist, 1); placeCamera();
      // As an object on a shelf: the world and what orbits it, without the sky behind.
      const hidden = object && current ? current.skyLayer.children.slice(1).filter(o => o.visible && !o.userData.keepInCapture) : [];
      hidden.forEach(o => { o.visible = false; });
      renderer.render(scene, camera);
      hidden.forEach(o => { o.visible = true; });
      const url = renderer.domElement.toDataURL('image/png');
      renderer.setPixelRatio(pr);
      renderer.setSize(ow / pr, oh / pr, false);
      camera.aspect = oa; size();
      return url;
    },
    pause() { running = false; },
    resume() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } },
    dispose() { running = false; ro.disconnect(); current?.dispose?.(); renderer.dispose(); host.replaceChildren(); }
  };
}

/* -------- hand-drawn ornament: orbit rings, dotted trails, four-point sparkles -------- */
function drawOrnament(svg, seed, ink, dark, style = 'orbits') {
  const r = rngFor(seed, 'ornament');
  const NS = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const add = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); svg.appendChild(n); return n; };
  const wobblyEllipse = (cx, cy, rx, ry, rot, jitter) => {
    let d = '';
    const n = 72;
    const p1 = r() * 6, p2 = r() * 6, f1 = 2 + Math.floor(r() * 3), f2 = 5 + Math.floor(r() * 4);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, j = 1 + jitter * (Math.sin(a * f1 + p1) * 0.6 + Math.sin(a * f2 + p2) * 0.4);
      const x = Math.cos(a) * rx * j, y = Math.sin(a) * ry * j;
      const xr = cx + x * Math.cos(rot) - y * Math.sin(rot), yr = cy + x * Math.sin(rot) + y * Math.cos(rot);
      d += (i ? 'L' : 'M') + xr.toFixed(2) + ' ' + yr.toFixed(2);
    }
    return d;
  };
  const accents = dark ? ['#F7E38C', '#9FE6F0', '#F4B8D0', '#C9B8FF'] : ['#F2CF5B', '#69C8D8', '#EE9DB4', '#9C8BE0'];
  const op = dark ? 0.55 : 0.5;
  const sparkle = (x, y, s, color) => {
    const k = s * 0.22;
    add('path', { d: `M${x} ${y - s} Q${x + k} ${y - k} ${x + s} ${y} Q${x + k} ${y + k} ${x} ${y + s} Q${x - k} ${y + k} ${x - s} ${y} Q${x - k} ${y - k} ${x} ${y - s}Z`, fill: color, opacity: 0.9 });
  };
  if (style === 'none') return;
  if (style === 'sparkles' || style === 'starry') { // no orbit lines: a few soft glints (more of them around a planet)
    for (let i = 0; i < (style === 'starry' ? 18 : 9); i++) {
      const a = r() * Math.PI * 2, d = 24 + r() * 26, x = 50 + Math.cos(a) * d * 0.8, y = 50 + Math.sin(a) * d;
      if (x < 4 || x > 96 || y < 4 || y > 96) continue;
      i % 3 ? sparkle(x, y, 0.5 + r() * 1.1, accents[i % 4]) : add('circle', { cx: x, cy: y, r: 0.2 + r() * 0.3, fill: accents[(i + 1) % 4], opacity: 0.6 });
    }
    return;
  }
  add('path', { d: wobblyEllipse(50, 50, 41, 41, 0, 0.012), fill: 'none', stroke: ink, 'stroke-width': 0.22, opacity: op * 0.8 });
  add('path', { d: wobblyEllipse(50, 50, 46, 44, r() * 3, 0.02), fill: 'none', stroke: accents[Math.floor(r() * 4)], 'stroke-width': 0.35, 'stroke-dasharray': '0.1 1.6', 'stroke-linecap': 'round', opacity: op + 0.2 });
  add('path', { d: wobblyEllipse(50, 50, 48, 17, -0.35 + r() * 0.2, 0.01), fill: 'none', stroke: ink, 'stroke-width': 0.18, opacity: op * 0.6 });
  // planets-on-orbit dots, like a flash sheet
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2, rr = [41, 46, 44][i];
    add('circle', { cx: 50 + Math.cos(a) * rr, cy: 50 + Math.sin(a) * rr, r: 0.8 + r() * 1.2, fill: accents[i], opacity: 0.85 });
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = 30 + r() * 24;
    const x = 50 + Math.cos(a) * d, y = 50 + Math.sin(a) * d;
    if (x < 2 || x > 98 || y < 2 || y > 98) continue;
    if (r() < 0.6) sparkle(x, y, 0.8 + r() * 1.8, accents[i % 4]);
    else add('circle', { cx: x, cy: y, r: 0.25 + r() * 0.4, fill: accents[(i + 1) % 4], opacity: 0.8 });
  }
}
