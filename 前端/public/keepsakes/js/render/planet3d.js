// Tiny Planet renderer. Deterministic: (spec, seed) -> the same world every time.
// Every object is registered under the slot that caused it, so the reveal can build the world
// one sealed pick at a time, and the story can point at what came from whom.
import { THREE, toon, glow, mesh, group, stand, outline, mixHex, shade, noise3, fib, points, spriteTex, setInk, inkMaterial, indexed, enrich, shadows, shadowKey, halo } from './kit.js';
import { rngFor } from '../engine/codec.js';
export { THREE };

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
// Reserved places: the dwelling faces you from the top; the two wonders stand left (human) and right (AI);
// the secret is buried on the far side, so you have to turn the world to find it.
export const SPOTS = {
  dwelling: V(0, 0.84, 0.54),
  wonderH: V(-0.78, 0.12, 0.62),
  wonderA: V(0.78, 0.12, 0.62),
  secret: V(0.15, -0.25, -0.95)
};
// A sleeping volcano (land: ember) rises on the far upper side, so turning the world finds it.
const VOLCANO = V(-0.42, 0.5, -0.76);

const CANOPY = {
  meadow: ['#7FB77E', '#93C88A', '#A8D69A'], flowers: ['#86BF86', '#F2B6C6', '#9ECF91'], dunes: ['#A9B97F', '#C3C98E', '#8FA674'],
  snow: ['#6F9C8C', '#7FAE9C', '#FFFFFF'], crystal: ['#B9A6EE', '#D4C6FA', '#9C8BE0'], moss: ['#4E9E90', '#68C2AE', '#3E8580'],
  autumn: ['#E58E5A', '#F0B35F', '#D46E58'], cloud: ['#B9E3D3', '#F6C9DA', '#D9D0F5'],
  lavender: ['#8FAE7E', '#A3BD8C', '#7D9E74'], terraces: ['#6FA466', '#84B873', '#5E965E'], ember: ['#6E8C6A', '#7FA07A', '#5E7A64']
};

export function build(spec, seed, opts = {}) { return buildPlanet(spec, seed, opts); }

export function buildPlanet(spec, seed, { renderer } = {}) {
  const rand = rngFor(seed, 'planet');
  const N = noise3(rand);
  const pal = spec.palette;
  const P = spec.picks;
  setInk(pal.dark ? '#0A0D24' : mixHex(pal.ink, '#3A3350', 0.5));

  const world = new THREE.Group();     // turns with the user's hand
  const skyLayer = new THREE.Group();  // fixed behind the world
  const parts = {};                    // slot -> [Object3D]
  const tickers = [];
  const add = (slot, obj, parent = world) => { (parts[slot] ||= []).push(obj); parent.add(obj); return obj; };

  /* ---------------- terrain ---------------- */
  const land = P.land.id, water = P.water.id;
  const coverage = { sea: 0.42, lakes: 0.16, frozen: 0.2, springs: 0.08, starsea: 0.38, pools: 0.12 }[water] || 0;
  const amp = { dunes: 0.22, cloud: 0.2, snow: 0.3, crystal: 0.34, lavender: 0.26, terraces: 0.5, ember: 0.3 }[land] || 0.3;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const raw = dir => {
    let h = N(dir.x * 1.7 + 3, dir.y * 1.7, dir.z * 1.7, 4);
    if (land === 'dunes') h += 0.05 * Math.sin((dir.x * 9 + dir.z * 5) + N(dir.x * 3, dir.y * 3, dir.z * 3) * 6);
    if (land === 'cloud') h = Math.abs(h) * 0.9 + 0.03 * N(dir.x * 6, dir.y * 6, dir.z * 6);
    if (land === 'lavender') h += 0.018 * Math.sin((dir.x * 3 + dir.y * 2) * 22); // the rows of a lavender field
    if (land === 'ember') { const d = dir.dot(VOLCANO); h += 0.5 * sstep(0.84, 0.985, d) - 0.22 * sstep(0.985, 1, d); }
    for (const k of ['dwelling', 'wonderH', 'wonderA', 'secret']) {
      const d = dir.dot(SPOTS[k]);
      if (d > 0.93) h = Math.max(h, 0.12 + (d - 0.93) * 0.4);
    }
    return h;
  };
  const geo = indexed(new THREE.IcosahedronGeometry(1, 28));
  const pos = geo.attributes.position;
  const dirs = [], raws = new Float32Array(pos.count);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { tmp.fromBufferAttribute(pos, i).normalize(); dirs.push(tmp.clone()); raws[i] = raw(tmp); }
  const sorted = Float32Array.from(raws).sort();
  // With water, the lowest `coverage` share of the ground sits under the sea. Without it, the world stays round.
  const T = coverage ? sorted[Math.floor(sorted.length * coverage)] : sorted[Math.floor(sorted.length * 0.5)];
  const lo = sorted[0], hi = sorted[sorted.length - 1];
  // Tea terraces: the slope is cut into soft steps.
  const STEP = 0.055;
  const step = land === 'terraces' ? (x => { const q = x / STEP, f = q - Math.floor(q); return (Math.floor(q) + sstep(0.8, 1, f)) * STEP; }) : (x => x);
  const radiusOf = coverage
    ? (h => h > T ? 1.004 + amp * step(h - T) : 0.97 - amp * 0.8 * (T - h))
    : (h => 1 + amp * 0.45 * (h > T ? step(h - T) : h - T));
  const surface = dir => radiusOf(raw(dir.clone().normalize()));
  const colors = new Float32Array(pos.count * 3);
  const c0 = new THREE.Color(pal.land[0]), c1 = new THREE.Color(pal.land[1]), c2 = new THREE.Color(pal.land[2]);
  const shore = new THREE.Color(mixHex(pal.land[0], '#F4E6C4', 0.55)), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = raws[i], r = radiusOf(h);
    pos.setXYZ(i, dirs[i].x * r, dirs[i].y * r, dirs[i].z * r);
    const e = coverage ? (h - T) / Math.max(0.001, hi - T) : (h - lo) / Math.max(0.001, hi - lo);
    if (e < 0.5) c.copy(c1).lerp(c0, e * 2); else c.copy(c0).lerp(c2, (e - 0.5) * 2);
    if (coverage && e < 0.05 && e > -0.02 && water !== 'frozen') c.lerp(shore, 0.6);
    // soft patches, so the ground reads as painted rather than flat
    const patch = N(dirs[i].x * 4.1 + 9, dirs[i].y * 4.1, dirs[i].z * 4.1, 2);
    if (patch > 0.08) c.lerp(c2, Math.min(0.45, (patch - 0.08) * 2.2)); else if (patch < -0.1) c.lerp(c1, Math.min(0.4, (-0.1 - patch) * 2));
    // a little ambient occlusion: valleys sit slightly in shadow, so the relief reads in 3D
    c.multiplyScalar(0.88 + 0.12 * Math.min(1, Math.max(0, e)));
    if (land === 'ember') { const d = dirs[i].dot(VOLCANO); if (d > 0.9) c.lerp(new THREE.Color('#4E4452'), sstep(0.9, 0.99, d) * 0.6); }
    // tea rows: every other terrace a shade lighter, with a pale edge where it steps down
    if (land === 'terraces' && h > T) { const q = (h - T) / STEP, f = q - Math.floor(q); if (Math.floor(q) % 2) c.lerp(c2, 0.35); if (f > 0.8) c.lerp(new THREE.Color('#E8DDB8'), 0.35); }
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Lava seams (ember): thin glowing lines where a second noise crosses zero, brightest near the crater.
  if (land === 'ember') {
    const gl = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      // a smooth, wide function reads well even at vertex resolution: soft warm veins, brightest at the crater
      const d = dirs[i], n2 = N(d.x * 2.6 + 11, d.y * 2.6, d.z * 2.6, 2), seam = Math.pow(Math.max(0, 1 - Math.abs(n2) * 7), 2.2);
      const crater = sstep(0.965, 0.995, d.dot(VOLCANO)), slope = sstep(0.86, 0.97, d.dot(VOLCANO));
      gl[i] = Math.min(1, seam * 0.45 + crater + slope * seam * 0.4);
    }
    geo.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  }
  geo.computeVertexNormals();
  const landMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon('#fff').gradientMap });
  if (land === 'moss') { landMat.emissive = new THREE.Color(pal.glow); landMat.emissiveIntensity = spec.flags.glowLand ? 0.32 : 0.1; }
  // the sky's light caught at the world's edge, on the ground itself
  const landFx = enrich(landMat, { rim: pal.dark ? mixHex(pal.light, '#8E9CFF', 0.3) : mixHex(pal.bg[1], '#FFFFFF', 0.25), rimK: pal.dark ? 0.3 : 0.32, rimPow: pal.dark ? 3.2 : 2.6, glow: land === 'ember' ? pal.glow : null });
  if (land === 'ember') tickers.push(t => { landFx.uGlowK.value = 0.6 + 0.18 * Math.sin(t * 1.3) + 0.06 * Math.sin(t * 3.7); });
  const terrain = outline(new THREE.Mesh(geo, landMat), 0.009);
  add('land', terrain);
  // A soft atmosphere: the sky's own light, caught at the world's edge.
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.16, 48, 32), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color(pal.dark ? pal.light : mixHex(pal.bg[1], '#ffffff', 0.4)) }, k: { value: pal.dark ? 0.45 : 0.32 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 c; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.0-abs(dot(vN,vV)),2.2); float edge=smoothstep(0.0,0.35,abs(dot(vN,vV))); gl_FragColor=vec4(c, f*edge*k); }'
  }));
  add('sky', atmo);
  // Grey stand-in used before the land is revealed.
  const greyMat = toon(pal.dark ? '#5F6488' : '#D9D3DE');
  terrain.userData.landMat = landMat; terrain.userData.greyMat = greyMat;

  // Land details that belong to the land pick.
  const landDirs = fib(1400).filter(d => raw(d) > T + 0.015 && !nearSpot(d, 0.22));
  shuffle(landDirs, rand);
  if (land === 'flowers' || land === 'lavender') add('land', scatterInstanced(landDirs.slice(0, land === 'lavender' ? 380 : 320), surface, [
    land === 'lavender'
      ? { geo: new THREE.ConeGeometry(0.009, 0.045, 5), color: '#9B86D6', y: 0.022, palette: pal.dots }
      : { geo: new THREE.IcosahedronGeometry(0.014, 1), color: '#ffffff', y: 0.012, palette: pal.dots }
  ], rand, 0.9, 1.3));
  if (land === 'ember') {
    // the crater glows and breathes a little smoke; with snow or rain falling on it, a column of steam
    const top = VOLCANO.clone().multiplyScalar(surface(VOLCANO) + 0.01);
    const crater = halo(pal.glow, 0.34, 0.75); crater.position.copy(top); add('land', crater);
    const puffs = new THREE.Group(); stand(puffs, VOLCANO, surface(VOLCANO) + 0.02); add('land', puffs);
    const n = spec.flags.steam ? 9 : 5;
    for (let k = 0; k < n; k++) puffs.add(mesh(new THREE.IcosahedronGeometry(0.03, 1), toon(spec.flags.steam ? '#FFFFFF' : '#B9AEB8', { opacity: 0.75 })));
    tickers.push(t => { crater.material.opacity = 0.55 + 0.25 * Math.sin(t * 1.3); puffs.children.forEach((p, k) => { const ph = (t * 0.22 + k / n) % 1; p.position.set(Math.sin(ph * 5 + k) * 0.03, ph * (spec.flags.steam ? 0.5 : 0.3), Math.cos(ph * 4 + k) * 0.02); p.scale.setScalar(0.6 + ph * (spec.flags.steam ? 2.4 : 1.6)); p.material.opacity = 0.7 * (1 - ph); }); });
  }
  if (land === 'crystal' || land === 'snow') add('land', scatterInstanced(landDirs.slice(320, land === 'crystal' ? 360 : 345), surface, [
    { geo: new THREE.OctahedronGeometry(0.03, 0), color: land === 'crystal' ? pal.shards : '#F4F8FF', y: 0.02, sy: 2.2, ink: 0.08, opts: { flat: true, emissive: land === 'crystal' ? '#6F5BC9' : '#000', emissiveIntensity: 0.15 } }
  ], rand, 0.6, 1.5));

  /* ---------------- water ---------------- */
  if (coverage) {
    const wc = pal.water;
    // Depth you can see: shallow water is pale, deep water darker, and a soft line of foam at the shore.
    const wgeo = new THREE.SphereGeometry(0.988, 96, 64), wp = wgeo.attributes.position, wcol = new Float32Array(wp.count * 3), wv = new THREE.Vector3();
    const shallow = new THREE.Color(mixHex(wc, '#FFFFFF', water === 'starsea' ? 0.12 : 0.38)), deep = new THREE.Color(shade(wc, water === 'starsea' ? 0.7 : 0.8)), foam = new THREE.Color(water === 'starsea' ? '#B9C4FF' : '#FFFFFF'), wcc = new THREE.Color();
    const poolCols = (P.water.pools || []).map(x => new THREE.Color(x));
    for (let i = 0; i < wp.count; i++) {
      wv.fromBufferAttribute(wp, i).normalize();
      const hgt = raw(wv), dpt = Math.min(1, Math.max(0, (T - hgt) / Math.max(0.001, T - lo)));
      if (poolCols.length) { const k = Math.floor((N(wv.x * 2.3 + 5, wv.y * 2.3, wv.z * 2.3, 1) + 0.5) * poolCols.length * 1.6); wcc.copy(poolCols[((k % poolCols.length) + poolCols.length) % poolCols.length]).lerp(deep, dpt * 0.25); }
      else wcc.copy(shallow).lerp(deep, Math.pow(dpt, 0.7));
      if (water !== 'frozen' && dpt < 0.06) wcc.lerp(foam, (1 - dpt / 0.06) * 0.55);
      wcol.set([wcc.r, wcc.g, wcc.b], i * 3);
    }
    wgeo.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
    const wm = new THREE.MeshToonMaterial({ color: '#FFFFFF', vertexColors: true, gradientMap: toon('#fff').gradientMap, transparent: true, opacity: water === 'frozen' ? 0.96 : 0.9,
      emissive: spec.flags.reflect ? '#3E9C94' : (water === 'frozen' ? '#AFCFE8' : '#000'), emissiveIntensity: spec.flags.reflect ? 0.35 : (water === 'frozen' ? 0.15 : 0) });
    enrich(wm, { rim: pal.dark ? '#9FB0FF' : '#FFFFFF', rimK: 0.45, rimPow: 3 });
    add('water', new THREE.Mesh(wgeo, wm));
    // moving light on the surface (not on ice)
    if (water !== 'frozen') add('water', glints(water === 'starsea' ? '#E9ECFF' : pal.dark ? '#DDE4FF' : '#FFFFFF', water === 'starsea' ? (spec.flags.starMirror ? 1.5 : 1.1) : pal.dark ? 0.9 : 0.38, tickers));
    if (water === 'starsea') {
      const low = fib(900).filter(d => raw(d) < T - 0.01); shuffle(low, rand);
      const sp = new Float32Array(low.length * 3); low.forEach((d, i) => { const q = d.clone().multiplyScalar(0.992); sp.set([q.x, q.y, q.z], i * 3); });
      const stars = points(sp, { size: 0.05, color: '#FFF6D8', shape: 'star', additive: true });
      add('water', stars); tickers.push(t => { stars.material.opacity = 0.65 + 0.35 * Math.sin(t * 2.1); });
    }
    if (water === 'springs') {
      const low = fib(500).filter(d => raw(d) < T - 0.01);
      shuffle(low, rand);
      low.slice(0, 5).forEach((d, i) => {
        const steam = new THREE.Group();
        for (let k = 0; k < 4; k++) steam.add(mesh(new THREE.IcosahedronGeometry(0.025, 1), toon('#FFFFFF', { opacity: 0.7 })));
        stand(steam, d, 1.0);
        add('water', steam);
        tickers.push((t) => steam.children.forEach((s, k) => { const ph = (t * 0.35 + k / 4 + i * 0.13) % 1; s.position.set(Math.sin(ph * 6 + k) * 0.02, ph * 0.22, 0); s.scale.setScalar(0.6 + ph * 1.4); s.material.opacity = 0.75 * (1 - ph); }));
      });
    }
  } else if (water === 'river') {
    const pts = [], ph = rand() * 6;
    for (let i = 0; i < 220; i++) {
      const th = (i / 220) * Math.PI * 2, lat = 0.32 * Math.sin(2 * th + ph) + 0.12 * Math.sin(5 * th);
      const d = new THREE.Vector3(Math.cos(lat) * Math.cos(th), Math.sin(lat), Math.cos(lat) * Math.sin(th));
      pts.push(d.multiplyScalar(surface(d) + 0.006));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const bright = spec.flags.glowRiver;
    add('water', group(
      new THREE.Mesh(new THREE.TubeGeometry(curve, 440, 0.011, 6, true), glow(bright ? '#E6FBFF' : pal.water)),
      new THREE.Mesh(new THREE.TubeGeometry(curve, 220, bright ? 0.028 : 0.022, 6, true), new THREE.MeshBasicMaterial({ color: pal.water, transparent: true, opacity: bright ? 0.28 : 0.16, blending: THREE.AdditiveBlending, depthWrite: false }))
    ));
  } else if (water === 'floating') {
    landDirs.slice(400, 405).forEach((d, i) => {
      const pond = mesh(new THREE.SphereGeometry(0.075, 20, 14), toon(pal.water, { opacity: 0.88 }), { ink: 0.06, scale: [1, 0.42, 1] });
      const holder = new THREE.Group(); holder.add(pond);
      stand(holder, d, surface(d) + 0.22 + rand() * 0.12);
      add('water', holder);
      tickers.push(t => { pond.position.y = Math.sin(t * 1.2 + i) * 0.025; });
    });
  }

  /* ---------------- growth ---------------- */
  const growth = P.growth.id;
  const canopy = CANOPY[land] || CANOPY.meadow;
  const gCount = { round: 42, pines: 60, mushrooms: 14, crystaltrees: 26, lanterns: 70, puffs: 30, reeds: 90, cherry: 40, cacti: 34, sunflowers: 64 }[growth];
  const gDirs = landDirs.slice(420, 420 + gCount);
  const trunk = '#9C7A63';
  const templates = {
    round: [{ geo: new THREE.CylinderGeometry(0.007, 0.01, 0.06, 6), color: trunk, y: 0.03 }, { geo: new THREE.IcosahedronGeometry(0.042, 1), color: canopy[0], y: 0.085, ink: 0.1, palette: canopy }],
    pines: [{ geo: new THREE.CylinderGeometry(0.006, 0.008, 0.03, 5), color: trunk, y: 0.015 }, { geo: new THREE.ConeGeometry(0.04, 0.075, 7), color: canopy[0], y: 0.06, ink: 0.1, palette: canopy.slice(0, 2) }, { geo: new THREE.ConeGeometry(0.028, 0.055, 7), color: land === 'snow' ? '#FFFFFF' : canopy[1], y: 0.1, ink: 0.1 }],
    mushrooms: [{ geo: new THREE.CylinderGeometry(0.018, 0.026, 0.12, 8), color: '#F6EBDD', y: 0.06, ink: 0.08 }, { geo: new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), color: '#EE8C96', y: 0.115, ink: 0.06, palette: ['#EE8C96', '#F3B37A', '#B79BEA', '#8EC5E8'] }],
    crystaltrees: [{ geo: new THREE.CylinderGeometry(0.005, 0.008, 0.05, 5), color: '#B5A3D8', y: 0.025 }, { geo: new THREE.OctahedronGeometry(0.045, 0), color: '#CFC2FF', y: 0.09, sy: 1.5, ink: 0.08, opts: { opacity: 0.85, flat: true, emissive: '#7A68D8', emissiveIntensity: 0.25 }, palette: ['#CFC2FF', '#BFE6FF', '#FFD6EC'] }],
    lanterns: [{ geo: new THREE.CylinderGeometry(0.003, 0.003, 0.06, 4), color: '#6E8F70', y: 0.03 }, { geo: new THREE.IcosahedronGeometry(0.016, 1), color: '#FFD98A', y: 0.065, glow: true, palette: spec.flags.glowGrowth ? ['#FFE7A3', '#FFD27A', '#FFF2C8'] : ['#F5C987', '#F4B69A', '#F6DFA0'] }],
    puffs: [{ geo: new THREE.CylinderGeometry(0.006, 0.009, 0.07, 5), color: '#C9A88E', y: 0.035 }, { geo: new THREE.IcosahedronGeometry(0.045, 2), color: '#F8C7DA', y: 0.095, ink: 0.08, palette: ['#F8C7DA', '#C6E3F7', '#FBE4B0', '#D9CCF7'] }],
    reeds: [{ geo: new THREE.ConeGeometry(0.008, 0.09, 4), color: canopy[1], y: 0.045, palette: canopy }],
    cherry: [{ geo: new THREE.CylinderGeometry(0.007, 0.011, 0.065, 6), color: '#8E6B5E', y: 0.032 }, { geo: new THREE.IcosahedronGeometry(0.046, 1), color: '#F6C1CF', y: 0.09, ink: 0.1, palette: ['#F6C1CF', '#F9D7E0', '#F2A9BE', '#FFF3F6'] }],
    cacti: [{ geo: new THREE.SphereGeometry(0.03, 12, 9), color: '#86BD8F', y: 0.03, sy: 1.4, ink: 0.1, palette: ['#86BD8F', '#78B087', '#9CCB9A'] }, { geo: new THREE.IcosahedronGeometry(0.011, 0), color: '#F4A9C0', y: 0.074, palette: ['#F4A9C0', '#FFE08A', '#FFFFFF', '#F7B98A'] }],
    sunflowers: [{ geo: new THREE.CylinderGeometry(0.003, 0.004, 0.08, 4), color: '#6E9A58', y: 0.04 }, { geo: new THREE.CylinderGeometry(0.024, 0.024, 0.006, 12).rotateX(Math.PI / 2), color: '#F6CF52', y: 0.085, ink: 0.12, palette: ['#F6CF52', '#F4BE3C', '#F9DC74'] }, { geo: new THREE.CylinderGeometry(0.011, 0.011, 0.008, 10).rotateX(Math.PI / 2).translate(0, 0, 0.003), color: '#7A5233', y: 0.085 }]
  };
  add('growth', scatterInstanced(gDirs, surface, templates[growth], rand, 0.7, 1.25));
  if (growth === 'lanterns' && spec.flags.glowGrowth) {
    const glowPts = new Float32Array(gDirs.length * 3);
    gDirs.forEach((d, i) => { const p = d.clone().multiplyScalar(surface(d) + 0.065); glowPts.set([p.x, p.y, p.z], i * 3); });
    add('growth', points(glowPts, { size: 0.12, color: '#FFD98A', opacity: 0.55, additive: true }));
  }

  /* ---------------- dwelling ---------------- */
  const dwell = buildDwelling(P.dwelling.id, spec, tickers, rand);
  if (P.dwelling.id === 'train') { add('dwelling', dwell); }
  else { stand(dwell, SPOTS.dwelling, surface(SPOTS.dwelling) - 0.005, 0.3); add('dwelling', dwell); }

  /* ---------------- wonders ---------------- */
  spec.wonders.forEach((w, i) => {
    const spot = i === 0 ? SPOTS.wonderH : SPOTS.wonderA;
    const obj = buildWonder(w.id, spot, surface, tickers, rand, pal, i);
    add(i === 0 ? 'wonderH' : 'wonderA', obj);
  });

  /* ---------------- secret (ground half's line) ---------------- */
  const secretLine = spec.lines.find(l => l.key === 'secret');
  if (secretLine?.text) {
    const mark = group(
      mesh(new THREE.BoxGeometry(0.075, 0.012, 0.016), toon('#C7524E'), { rot: [0, 0.78, 0] }),
      mesh(new THREE.BoxGeometry(0.075, 0.012, 0.016), toon('#C7524E'), { rot: [0, -0.78, 0] }),
      mesh(new THREE.SphereGeometry(0.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(shade(pal.land[1], 0.85)), { pos: [0, -0.03, 0] })
    );
    stand(mark, SPOTS.secret, surface(SPOTS.secret) + 0.004);
    mark.userData.pick = 'secret';
    mark.children.forEach(ch => ch.userData.pick = 'secret');
    add('secret', mark);
  }

  /* ---------------- sky: light, background things ---------------- */
  const sky = P.sky.id;
  const hemi = new THREE.HemisphereLight(pal.light, pal.dark ? '#4A4F7E' : '#E9DDE6', pal.dark ? 0.9 : 1.15);
  const key = new THREE.DirectionalLight(pal.light, pal.dark ? 1.6 : 2.0);
  key.position.set(-3, 3.5, 4);
  shadowKey(key, 2.5, (typeof window !== 'undefined' && window.innerWidth > 700) ? 2048 : 1280);
  // a cool light from behind, so the silhouette separates from the sky
  const back = new THREE.DirectionalLight(pal.dark ? '#AFC0FF' : mixHex(pal.bg[1], '#FFFFFF', 0.4), pal.dark ? 0.9 : 0.7);
  back.position.set(3, 1.5, -4);
  const lights = group(hemi, key, back);
  skyLayer.add(lights);
  if (pal.dark) {
    const n = 260, sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) sp.set([(rand() - 0.5) * 14, (rand() - 0.5) * 10, -4 - rand() * 4], i * 3);
    const stars = points(sp, { size: 0.09, color: '#FFFFFF', shape: 'star', opacity: 0.9 });
    add('sky', stars, skyLayer);
    tickers.push(t => { stars.material.opacity = 0.7 + 0.25 * Math.sin(t * 1.7); });
  }
  if (sky === 'aurora') add('sky', aurora(tickers), skyLayer);
  if (sky === 'eclipse') add('sky', eclipse(), skyLayer);
  if (sky === 'milkyway') add('sky', milkyWay(rand, tickers), skyLayer);
  if (sky === 'dawn' || sky === 'sunset' || sky === 'noon' || sky === 'lilac') {
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('dot', '#ffffff'), color: sky === 'noon' ? '#FFF6D8' : '#FFD7B0', transparent: true, opacity: 0.9, depthWrite: false }));
    sun.position.set(-2.6, 1.9, -3); sun.scale.setScalar(1.6);
    add('sky', sun, skyLayer);
  }

  /* ---------------- moons ---------------- */
  add('moon', buildMoons(P.moon.id, spec, tickers, rand, pal));

  /* ---------------- air ---------------- */
  const airObj = buildAir(P.air.id, spec, surface, tickers, rand, pal, landDirs);
  add('air', airObj, airObj.userData.skyFixed ? skyLayer : world);

  /* ---------------- visitor ---------------- */
  const vis = buildVisitor(P.visitor.id, spec, surface, tickers, rand, pal);
  add('visitor', vis);

  /* ---------------- depth: soft shadows, lit windows that glow ---------------- */
  shadows(world);
  terrain.castShadow = true; terrain.receiveShadow = true;
  if (pal.dark) world.traverse(o => { if (o.isMesh && o.material?.userData?.window && !o.userData.haloed) { o.userData.haloed = true; const hh = halo('#FFD98A', 0.09, 0.8); o.add(hh); } });

  /* ---------------- api ---------------- */
  let time = 0;
  const setLandRevealed = on => { terrain.material = on ? landMat : greyMat; };
  return {
    world, skyLayer, parts, spots: { ...SPOTS, front: new THREE.Vector3(0, 0.12, 1) }, terrain,
    update(dt) { time += dt; for (const f of tickers) f(time, dt); },
    setLandRevealed,
    /** Before the reveal: a grey, unlit world and nothing else. */
    prepareReveal() {
      setLandRevealed(false);
      for (const [slot, objs] of Object.entries(parts)) if (slot !== 'land') objs.forEach(o => { o.visible = false; });
      parts.land.slice(1).forEach(o => { o.visible = false; });
    },
    /** A slot with its own way of appearing. Returns true if handled. */
    reveal(slot, tween) {
      if (slot !== 'land') return false;
      setLandRevealed(true); parts.land.forEach(o => { o.visible = true; });
      tween(0.6, e => terrain.scale.setScalar(1 + Math.sin(e * Math.PI) * 0.04));
      return true;
    },
    revealAll() { setLandRevealed(true); for (const objs of Object.values(parts)) objs.forEach(o => { o.visible = true; }); },
    dispose() {
      [world, skyLayer].forEach(g => g.traverse(o => { o.geometry?.dispose?.(); }));
    }
  };
}

/* ======================================================================= helpers */

function nearSpot(d, ang) {
  const c = Math.cos(ang);
  return Object.values(SPOTS).some(s => d.dot(s) > c);
}
function shuffle(a, rand) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** One InstancedMesh (+ outline) per template part; per-instance colour from part.palette. */
function scatterInstanced(dirs, surface, template, rand, sMin, sMax) {
  const g = new THREE.Group();
  const n = dirs.length;
  const base = dirs.map(d => {
    const o = new THREE.Object3D();
    stand(o, d, surface(d) - 0.004, rand() * 6.28);
    const s = sMin + rand() * (sMax - sMin);
    o.scale.setScalar(s);
    o.updateMatrix();
    return { m: o.matrix.clone(), pick: rand() };
  });
  for (const part of template) {
    const mat = part.glow ? new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }) : toon('#ffffff', part.opts || {}).clone();
    const im = new THREE.InstancedMesh(part.geo, mat, n);
    const local = new THREE.Matrix4().compose(new THREE.Vector3(0, part.y || 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, part.sy || 1, 1));
    const m = new THREE.Matrix4(), col = new THREE.Color();
    let hull = null;
    if (part.ink) {
      hull = new THREE.InstancedMesh(part.geo, inkMaterial(), n);
      hull.userData.inkHull = true;
    }
    base.forEach((b, i) => {
      m.multiplyMatrices(b.m, local);
      im.setMatrixAt(i, m);
      const pal = part.palette || [part.color];
      im.setColorAt(i, col.set(pal[Math.floor(b.pick * pal.length) % pal.length]));
      if (hull) { const mh = m.clone().multiply(new THREE.Matrix4().makeScale(1 + part.ink, 1 + part.ink, 1 + part.ink)); hull.setMatrixAt(i, mh); }
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    g.add(im);
    if (hull) g.add(hull);
  }
  return g;
}

function line(points3, color, opacity = 1) {
  const geo = new THREE.BufferGeometry().setFromPoints(points3);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

function edges(m, color = '#2E2A44') {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 20), new THREE.LineBasicMaterial({ color }));
  m.add(l);
  return m;
}

/* ----------------------------------------------------------------- dwellings */
function buildDwelling(id, spec, tickers, rand) {
  const s = 1;
  const winGlow = glow('#FFE3A0'); winGlow.userData.window = true;
  const cream = toon('#F6EEE2'), rose = toon('#E58F8C'), blueRoof = toon('#8DA6E0'), wood = toon('#B98D6E');
  const ink = 0.05;
  switch (id) {
    case 'cottage': {
      return group(
        mesh(new THREE.BoxGeometry(0.16, 0.11, 0.12), cream, { pos: [0, 0.055, 0], ink }),
        mesh(new THREE.ConeGeometry(0.135, 0.09, 4), rose, { pos: [0, 0.155, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.8], ink }),
        mesh(new THREE.BoxGeometry(0.025, 0.05, 0.025), wood, { pos: [0.045, 0.19, 0.02], ink }),
        mesh(new THREE.PlaneGeometry(0.035, 0.035), winGlow, { pos: [-0.035, 0.06, 0.061] }),
        mesh(new THREE.PlaneGeometry(0.03, 0.055), toon('#9B6F5A'), { pos: [0.035, 0.0275, 0.061] })
      );
    }
    case 'lighthouse': {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.045 - i * 0.006, 0.05 - i * 0.006, 0.06, 14), i % 2 ? rose : cream, { pos: [0, 0.03 + i * 0.06, 0], ink }));
      g.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.04, 10), winGlow, { pos: [0, 0.26, 0] }));
      g.add(mesh(new THREE.ConeGeometry(0.038, 0.05, 10), rose, { pos: [0, 0.305, 0], ink }));
      if (spec.flags.beam) {
        const beam = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#FFF0B8', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        beam.rotation.z = Math.PI / 2; beam.position.x = 0.3;
        const pivot = group(beam); pivot.position.y = 0.26; g.add(pivot);
        tickers.push(t => { pivot.rotation.y = t * 0.9; });
      }
      return g;
    }
    case 'observatory': {
      const tele = mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.12, 8), toon('#6C6F96'), { ink });
      const telePivot = group(tele); tele.position.y = 0.05; telePivot.position.set(0, 0.15, 0);
      telePivot.rotation.z = spec.flags.aim ? -0.9 : -0.5; telePivot.rotation.x = spec.flags.aim ? -0.4 : 0;
      return group(
        mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.1, 16), cream, { pos: [0, 0.05, 0], ink }),
        mesh(new THREE.SphereGeometry(0.078, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon('#C9D2EE'), { pos: [0, 0.1, 0], ink }),
        telePivot,
        mesh(new THREE.PlaneGeometry(0.025, 0.04), winGlow, { pos: [0, 0.05, 0.081] })
      );
    }
    case 'greenhouse': {
      const glass = new THREE.MeshToonMaterial({ color: '#D8F3EE', transparent: true, opacity: 0.45, depthWrite: false, gradientMap: toon('#fff').gradientMap });
      const box = edges(mesh(new THREE.BoxGeometry(0.17, 0.09, 0.11), glass, { pos: [0, 0.045, 0] }), '#5F8C80');
      const roof = edges(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.17, 3, 1), glass, { pos: [0, 0.115, 0], rot: [0, 0, Math.PI / 2] }), '#5F8C80');
      const plants = [];
      for (let i = 0; i < 5; i++) plants.push(mesh(new THREE.IcosahedronGeometry(0.02, 1), toon(['#7FBF85', '#F2A9C0', '#9ED29A'][i % 3]), { pos: [-0.06 + i * 0.03, 0.02, (i % 2 - 0.5) * 0.04] }));
      return group(box, roof, plants);
    }
    case 'shrine': {
      const red = toon('#D9635B');
      return group(
        mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 6), red, { pos: [-0.06, 0.065, 0.06], ink }),
        mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 6), red, { pos: [0.06, 0.065, 0.06], ink }),
        mesh(new THREE.BoxGeometry(0.17, 0.014, 0.018), toon('#3E3448'), { pos: [0, 0.135, 0.06], ink }),
        mesh(new THREE.BoxGeometry(0.14, 0.01, 0.014), red, { pos: [0, 0.11, 0.06] }),
        mesh(new THREE.BoxGeometry(0.07, 0.06, 0.06), toon('#E9D9C2'), { pos: [0, 0.03, -0.03], ink }),
        mesh(new THREE.ConeGeometry(0.065, 0.04, 4), toon('#4E5D7D'), { pos: [0, 0.08, -0.03], rot: [0, Math.PI / 4, 0], ink })
      );
    }
    case 'tower': {
      const g = group(
        mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.2, 14), cream, { pos: [0, 0.1, 0], ink }),
        mesh(new THREE.ConeGeometry(0.068, 0.11, 14), blueRoof, { pos: [0, 0.255, 0], ink }),
        mesh(new THREE.PlaneGeometry(0.02, 0.03), winGlow, { pos: [0, 0.15, 0.052] })
      );
      const flag = mesh(new THREE.PlaneGeometry(0.04, 0.022), new THREE.MeshBasicMaterial({ color: '#E58F8C', side: THREE.DoubleSide }), { pos: [0.02, 0.32, 0] });
      g.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.06, 4), wood, { pos: [0, 0.32, 0] }), flag);
      tickers.push(t => { flag.rotation.y = Math.sin(t * 3) * 0.3; });
      return g;
    }
    case 'windmill': {
      const blades = new THREE.Group();
      for (let i = 0; i < 4; i++) { const b = mesh(new THREE.BoxGeometry(0.018, 0.11, 0.004), cream, { pos: [0, 0.055, 0], ink: 0.15 }); const p = group(b); p.rotation.z = i * Math.PI / 2; blades.add(p); }
      blades.position.set(0, 0.16, 0.05);
      tickers.push((t, dt) => { blades.rotation.z -= dt * 0.9; });
      return group(
        mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.16, 8), toon('#EADCC8'), { pos: [0, 0.08, 0], ink }),
        mesh(new THREE.ConeGeometry(0.045, 0.06, 8), rose, { pos: [0, 0.19, 0], ink }),
        blades
      );
    }
    case 'treehouse': {
      const g = group(
        mesh(new THREE.CylinderGeometry(0.022, 0.034, 0.24, 8), toon('#9C7A63'), { pos: [0, 0.12, 0], ink }),
        mesh(new THREE.IcosahedronGeometry(0.115, 1), toon('#86BF86'), { pos: [0, 0.3, -0.02], ink: 0.06 }),
        mesh(new THREE.IcosahedronGeometry(0.08, 1), toon('#9ED29A'), { pos: [0.07, 0.26, 0.04], ink: 0.06 }),
        mesh(new THREE.BoxGeometry(0.11, 0.012, 0.1), wood, { pos: [0, 0.17, 0.06], ink: 0.1 }),
        mesh(new THREE.BoxGeometry(0.075, 0.06, 0.06), cream, { pos: [0, 0.206, 0.07], ink }),
        mesh(new THREE.ConeGeometry(0.065, 0.045, 4), rose, { pos: [0, 0.258, 0.07], rot: [0, Math.PI / 4, 0], ink }),
        mesh(new THREE.PlaneGeometry(0.022, 0.022), winGlow, { pos: [0.015, 0.21, 0.101] })
      );
      for (const x of [-0.016, 0.016]) g.add(mesh(new THREE.BoxGeometry(0.004, 0.17, 0.004), wood, { pos: [x, 0.085, 0.13], rot: [-0.25, 0, 0] }));
      for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.036, 0.004, 0.004), wood, { pos: [0, 0.02 + i * 0.032, 0.118 + i * 0.008] }));
      return g;
    }
    case 'bakery': {
      const awn = new THREE.Group();
      for (let i = 0; i < 6; i++) awn.add(mesh(new THREE.BoxGeometry(0.028, 0.004, 0.05), toon(i % 2 ? '#FFF6EE' : '#E9909C'), { pos: [-0.07 + i * 0.028, 0, 0.02] }));
      awn.position.set(0, 0.085, 0.06); awn.rotation.x = 0.4;
      const smoke = new THREE.Group(); smoke.position.set(-0.045, 0.2, -0.02);
      for (let k = 0; k < 4; k++) smoke.add(mesh(new THREE.IcosahedronGeometry(0.016, 1), toon('#FFFFFF', { opacity: 0.75 })));
      tickers.push(t => smoke.children.forEach((p, k) => { const ph = (t * 0.3 + k / 4) % 1; p.position.set(Math.sin(ph * 5 + k) * 0.012, ph * 0.16, 0); p.scale.setScalar(0.6 + ph * 1.6); p.material.opacity = 0.75 * (1 - ph); }));
      return group(
        mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), toon('#F8EBDA'), { pos: [0, 0.05, 0], ink }),
        mesh(new THREE.ConeGeometry(0.13, 0.08, 4), toon('#B5806A'), { pos: [0, 0.14, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.8], ink }),
        mesh(new THREE.BoxGeometry(0.022, 0.05, 0.022), toon('#C9B3A2'), { pos: [-0.045, 0.17, -0.02], ink }),
        mesh(new THREE.PlaneGeometry(0.05, 0.035), winGlow, { pos: [-0.035, 0.05, 0.061] }),
        mesh(new THREE.PlaneGeometry(0.028, 0.05), toon('#9B6F5A'), { pos: [0.04, 0.025, 0.061] }),
        mesh(new THREE.TorusGeometry(0.012, 0.004, 6, 12), toon('#E6B66A'), { pos: [0.04, 0.078, 0.064] }),
        awn, smoke
      );
    }
    case 'tent': {
      const tri = new THREE.Shape(); tri.moveTo(-0.075, 0); tri.lineTo(0, 0.1); tri.lineTo(0.075, 0); tri.closePath();
      const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.13, bevelEnabled: false }); tg.translate(0, 0, -0.065);
      const fire = new THREE.Group(); fire.position.set(0.09, 0, 0.09);
      for (const r of [0.4, -0.5]) fire.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, 5), wood, { pos: [0, 0.004, 0], rot: [Math.PI / 2, r, 0] }));
      const flame = mesh(new THREE.ConeGeometry(0.012, 0.03, 6), glow('#FFB45C'), { pos: [0, 0.018, 0] });
      const fh = halo('#FFB45C', 0.14, 0.8); fh.position.y = 0.02; fire.add(flame, fh);
      if (spec.palette.dark) { const l = new THREE.PointLight('#FFB070', 0.9, 0.6, 2); l.position.y = 0.04; fire.add(l); }
      tickers.push(t => { const f = 0.85 + 0.2 * Math.sin(t * 13) * Math.sin(t * 7.3); flame.scale.set(1, f, 1); fh.material.opacity = 0.55 + 0.3 * f - 0.25; });
      return group(
        mesh(tg, toon('#E9A07A'), { ink }),
        mesh(new THREE.PlaneGeometry(0.03, 0.05), winGlow, { pos: [0, 0.025, 0.066] }),
        mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 4), wood, { pos: [0, 0.11, 0.06] }),
        fire
      );
    }
    case 'train': {
      // A rail ring around the world, slightly tilted, with a little train that always comes back around.
      const ring = new THREE.Group();
      const R = 1.2;
      ring.add(mesh(new THREE.TorusGeometry(R, 0.006, 6, 160), toon('#8C7B9C')));
      for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; ring.add(mesh(new THREE.BoxGeometry(0.008, 0.04, 0.012), wood, { pos: [Math.cos(a) * R, Math.sin(a) * R, 0], rot: [0, 0, a] })); }
      const cars = [];
      const colorsT = ['#E58F8C', '#F6EEE2', '#8DA6E0', '#F6EEE2'];
      for (let i = 0; i < 4; i++) {
        const car = group(mesh(new THREE.BoxGeometry(0.07, 0.04, 0.045), toon(colorsT[i]), { ink: 0.08, pos: [0, 0, 0.03] }));
        if (i === 0) car.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6), toon('#3E3448'), { pos: [0.02, 0, 0.065], rot: [Math.PI / 2, 0, 0] }));
        car.add(mesh(new THREE.PlaneGeometry(0.02, 0.014), glow('#FFE3A0'), { pos: [0, 0.021, 0.035], rot: [-Math.PI / 2, 0, 0] }));
        ring.add(car); cars.push(car);
      }
      tickers.push(t => cars.forEach((car, i) => { const a = t * 0.25 - i * 0.065; car.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); car.rotation.z = a + Math.PI / 2; }));
      ring.rotation.set(Math.PI / 2 - 0.35, 0, 0.2);
      // a small station on the reserved spot, so the dwelling slot is visible from the front
      return ring;
    }
  }
  return new THREE.Group();
}

/* ----------------------------------------------------------------- wonders */
function buildWonder(id, spot, surface, tickers, rand, pal, idx) {
  const r0 = surface(spot) - 0.005;
  const ink = 0.05;
  let g = new THREE.Group();
  switch (id) {
    case 'island': {
      const rock = mesh(new THREE.ConeGeometry(0.14, 0.2, 7), toon('#A897B8', { flat: true }), { rot: [Math.PI, 0, 0], ink });
      const top = mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.03, 7), toon(pal.land[0], { flat: true }), { pos: [0, 0.11, 0], ink });
      const tree = group(mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.05, 5), toon('#9C7A63'), { pos: [0, 0.15, 0] }), mesh(new THREE.IcosahedronGeometry(0.035, 1), toon('#8CC48A'), { pos: [0.0, 0.19, 0], ink: 0.1 }));
      const house = mesh(new THREE.BoxGeometry(0.035, 0.03, 0.03), toon('#F6EEE2'), { pos: [0.06, 0.14, 0.02], ink: 0.08 });
      const isle = group(rock, top, tree, house);
      const holder = group(isle);
      stand(holder, spot, r0 + 0.32);
      tickers.push(t => { isle.position.y = Math.sin(t * 0.9 + idx) * 0.025; isle.rotation.y = t * 0.1; });
      return holder;
    }
    case 'spire': {
      g.add(mesh(new THREE.OctahedronGeometry(0.06, 0), toon('#CFE6FF', { opacity: 0.88, flat: true, emissive: '#7E8BEA', emissiveIntensity: 0.3 }), { pos: [0, 0.2, 0], scale: [1, 3.6, 1], ink: 0.06 }));
      for (let i = 0; i < 4; i++) { const a = i * 1.7; g.add(mesh(new THREE.OctahedronGeometry(0.03, 0), toon(['#E7D8FF', '#CFE6FF', '#FFD9EE'][i % 3], { opacity: 0.9, flat: true }), { pos: [Math.cos(a) * 0.06, 0.04, Math.sin(a) * 0.06], scale: [1, 2.2, 1], rot: [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], ink: 0.08 })); }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('star'), color: '#FFFFFF', transparent: true, depthWrite: false }));
      sp.position.y = 0.44; sp.scale.setScalar(0.12); g.add(sp);
      tickers.push(t => { sp.material.rotation = t * 0.6; sp.scale.setScalar(0.1 + Math.sin(t * 2) * 0.02); });
      break;
    }
    case 'road': {
      // A glowing road leaving the spot and curling around the world.
      const pts = [];
      const axis = new THREE.Vector3(0, 1, 0).cross(spot).normalize().applyAxisAngle(spot, 0.6 * (idx ? -1 : 1));
      for (let i = 0; i <= 80; i++) {
        const d = spot.clone().applyAxisAngle(axis, (i / 80) * 1.9 * (idx ? -1 : 1));
        const tw = d.clone().applyAxisAngle(spot, Math.sin(i / 9) * 0.05);
        pts.push(tw.multiplyScalar(surface(tw) + 0.006));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const road = group(
        new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.016, 5), glow('#FFE7B0')),
        new THREE.Mesh(new THREE.TubeGeometry(curve, 100, 0.04, 6), new THREE.MeshBasicMaterial({ color: '#FFD98A', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }))
      );
      for (let i = 4; i <= 80; i += 12) {
        const p = pts[i], lamp = group(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.05, 4), toon('#5C5470'), { pos: [0, 0.025, 0] }), mesh(new THREE.IcosahedronGeometry(0.01, 1), glow('#FFF1C2'), { pos: [0, 0.055, 0] }));
        stand(lamp, p.clone().normalize(), p.length() - 0.004); road.add(lamp);
      }
      return road;
    }
    case 'bridge': {
      const pts = [];
      for (let i = 0; i <= 40; i++) { const k = i / 40; pts.push(new THREE.Vector3(Math.sin(k * 2.2) * 0.25 * k, k * 0.75, -Math.sin(k * 3) * 0.08)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.006, 4), toon('#B49378')));
      for (let i = 1; i <= 24; i++) {
        const k = i / 25, p = curve.getPointAt(k), tng = curve.getTangentAt(k);
        const plank = mesh(new THREE.BoxGeometry(0.06, 0.006, 0.02), toon(i % 2 ? '#E8D5BC' : '#D9BFA0'), { ink: 0.2 });
        plank.position.copy(p); plank.lookAt(p.clone().add(tng)); g.add(plank);
      }
      const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('star'), color: '#FFF3B8', transparent: true, depthWrite: false }));
      star.position.copy(pts[40]).add(new THREE.Vector3(0, 0.06, 0)); star.scale.setScalar(0.16); g.add(star);
      tickers.push(t => { star.material.rotation = -t * 0.5; });
      break;
    }
    case 'lighttree': {
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.026, 0.2, 7), toon('#8E6E5E'), { pos: [0, 0.1, 0], ink }));
      g.add(mesh(new THREE.IcosahedronGeometry(0.1, 2), toon('#556E8E', { opacity: 0.35 }), { pos: [0, 0.26, 0], scale: [1.2, 0.9, 1.2] }));
      const n = 70, p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const d = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(0.06 + rand() * 0.07); p.set([d.x * 1.3, 0.26 + d.y, d.z * 1.3], i * 3); }
      const lights = points(p, { size: 0.045, color: '#FFE6A6', additive: true });
      g.add(lights);
      tickers.push(t => { lights.material.opacity = 0.75 + 0.25 * Math.sin(t * 2.3 + idx); });
      break;
    }
    case 'upfall': {
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 20), toon(pal.water || '#9ED3F0'), { pos: [0, 0.006, 0], ink: 0.06 }));
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.055, 0.36, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#BFE8FF', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      col.position.y = 0.18; g.add(col);
      const n = 40, p = new Float32Array(n * 3), seedY = Float32Array.from({ length: n }, () => rand());
      const drops = points(p, { size: 0.03, color: '#E8F7FF' }); g.add(drops);
      tickers.push(t => {
        const a = drops.geometry.attributes.position;
        for (let i = 0; i < n; i++) { const k = (seedY[i] + t * 0.25) % 1, ang = i * 2.4; a.setXYZ(i, Math.cos(ang) * (0.03 + k * 0.04), k * 0.42, Math.sin(ang) * (0.03 + k * 0.04)); }
        a.needsUpdate = true;
      });
      break;
    }
    case 'arch': {
      g.add(mesh(new THREE.TorusGeometry(0.11, 0.028, 6, 14, Math.PI), toon('#BDB6C9', { flat: true }), { pos: [0, 0.0, 0], ink }));
      g.add(mesh(new THREE.PlaneGeometry(0.17, 0.1), new THREE.MeshBasicMaterial({ color: '#E9E1FF', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), { pos: [0, 0.05, 0] }));
      break;
    }
    case 'hourglass': {
      const wood = toon('#B08A6E'), glass = toon('#E6F2FF', { opacity: 0.5 }), sand = toon('#F2CF8A');
      g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 16), wood, { pos: [0, 0.009, 0], ink }), mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 16), wood, { pos: [0, 0.32, 0], ink }));
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 5), wood, { pos: [Math.cos(a) * 0.062, 0.165, Math.sin(a) * 0.062] })); }
      g.add(mesh(new THREE.ConeGeometry(0.05, 0.145, 16, 1, true), glass, { pos: [0, 0.092, 0], rot: [Math.PI, 0, 0] }), mesh(new THREE.ConeGeometry(0.05, 0.145, 16, 1, true), glass, { pos: [0, 0.238, 0] }));
      const pile = mesh(new THREE.ConeGeometry(0.04, 0.04, 14), sand, { pos: [0, 0.038, 0] }), top = mesh(new THREE.ConeGeometry(0.034, 0.05, 14), sand, { pos: [0, 0.205, 0], rot: [Math.PI, 0, 0] });
      const stream = mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.12, 4), glow('#F6D79A'), { pos: [0, 0.12, 0] });
      g.add(pile, top, stream);
      tickers.push(t => { const k = (t * 0.03 + idx * 0.4) % 1; top.scale.setScalar(1 - k * 0.7); pile.scale.set(0.5 + k * 0.6, 0.4 + k * 0.7, 0.5 + k * 0.6); stream.material.opacity = 1; });
      break;
    }
    case 'swing': {
      const holder = new THREE.Group(); holder.position.y = 0.56; g.add(holder);
      const seat = mesh(new THREE.BoxGeometry(0.09, 0.008, 0.035), toon('#C99B78'), { pos: [0, -0.48, 0], ink: 0.15 });
      holder.add(seat);
      for (const x of [-0.04, 0.04]) holder.add(line([new THREE.Vector3(x, -0.48, 0), new THREE.Vector3(x * 0.6, 0, 0)], pal.dark ? '#E6E3FF' : '#7A6C80', 0.75));
      const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('star'), color: '#FFF1B8', transparent: true, depthWrite: false })); star.scale.setScalar(0.09); holder.add(star);
      tickers.push(t => { holder.rotation.x = Math.sin(t * 1.5 + idx) * 0.32; star.material.rotation = t * 0.5; });
      break;
    }
    case 'mailbox': {
      const blue = toon('#8FA7D9'), red = toon('#D9635B');
      g.add(mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.13, 6), toon('#8E6E5E'), { pos: [0, 0.065, 0] }));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.1), blue, { pos: [0, 0.15, 0], ink }), mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 14, 1, false, 0, Math.PI), blue, { pos: [0, 0.17, 0], rot: [Math.PI / 2, Math.PI / 2, 0], ink }));
      const flag = group(mesh(new THREE.BoxGeometry(0.004, 0.05, 0.004), red, { pos: [0, 0.025, 0] }), mesh(new THREE.BoxGeometry(0.004, 0.018, 0.024), red, { pos: [0, 0.042, 0.012] }));
      flag.position.set(0.033, 0.14, -0.02); g.add(flag);
      const letter = mesh(new THREE.BoxGeometry(0.035, 0.024, 0.003), toon('#FFF8EC'), { pos: [0, 0.152, 0.052], ink: 0.2 });
      g.add(letter);
      tickers.push(t => { const k = (t * 0.12 + idx * 0.5) % 1; flag.rotation.x = k < 0.5 ? -Math.min(1, k * 8) * 1.2 : -1.2 * Math.max(0, 1 - (k - 0.5) * 8); letter.position.z = 0.05 + Math.max(0, Math.sin(k * Math.PI * 2)) * 0.012; });
      break;
    }
    case 'door': {
      const frame = toon('#F3ECE4'), panel = toon('#8FA7D9');
      g.add(mesh(new THREE.BoxGeometry(0.014, 0.17, 0.02), frame, { pos: [-0.05, 0.085, 0], ink: 0.1 }));
      g.add(mesh(new THREE.BoxGeometry(0.014, 0.17, 0.02), frame, { pos: [0.05, 0.085, 0], ink: 0.1 }));
      g.add(mesh(new THREE.BoxGeometry(0.114, 0.014, 0.02), frame, { pos: [0, 0.17, 0], ink: 0.1 }));
      g.add(mesh(new THREE.PlaneGeometry(0.086, 0.156), glow('#FFE8B8'), { pos: [0, 0.08, -0.002] }));
      const door = mesh(new THREE.BoxGeometry(0.086, 0.156, 0.01), panel, { pos: [0.043, 0, 0], ink: 0.06 });
      door.add(mesh(new THREE.SphereGeometry(0.006, 6, 6), toon('#E9C46A'), { pos: [0.03, 0, 0.008] }));
      const hinge = group(door); hinge.position.set(-0.043, 0.08, 0.004);
      g.add(hinge);
      tickers.push(t => { hinge.rotation.y = -0.55 - Math.sin(t * 0.6) * 0.1; });
      break;
    }
  }
  stand(g, spot, r0, idx ? -0.4 : 0.4);
  return g;
}

/* ----------------------------------------------------------------- water light */
function glints(color, k, tickers) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uK: { value: k } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uK; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        // two drifting noise fields; only where both peak does a tiny glint appear, and it twinkles
        float a = vnoise(vP * 90.0 + vec3(uTime * 0.6, uTime * 0.45, -uTime * 0.5));
        float b = vnoise(vP * 47.0 - vec3(uTime * 0.25, -uTime * 0.2, uTime * 0.3));
        float s = smoothstep(0.8, 0.97, a * b * 1.55);
        float facing = smoothstep(0.25, 0.8, dot(vN, vV));
        gl_FragColor = vec4(uColor, s * facing * 0.6 * uK);
      }`
  });
  tickers.push(t => { mat.uniforms.uTime.value = t; });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.9905, 96, 64), mat);
  m.raycast = () => {};
  return m;
}

function milkyWay(rand, tickers) {
  const g = new THREE.Group();
  const n = 900, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = (rand() - 0.5) * 15, spread = (rand() + rand() + rand() - 1.5) * 0.9;
    p.set([x, x * 0.42 + spread, -5 - rand() * 2], i * 3);
  }
  const band = points(p, { size: 0.045, color: '#F4F0FF', shape: 'dot', opacity: 0.8, additive: true });
  g.add(band);
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(170,160,255,0)'); gr.addColorStop(0.5, 'rgba(210,190,255,0.55)'); gr.addColorStop(1, 'rgba(170,160,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const glowBand = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowBand.position.set(0, 0, -6); glowBand.rotation.z = Math.atan(0.42);
  g.add(glowBand);
  tickers.push(t => { band.material.opacity = 0.7 + 0.15 * Math.sin(t * 1.1); });
  return g;
}

/* ----------------------------------------------------------------- sky things */
function aurora(tickers) {
  const g = new THREE.Group();
  const mats = [];
  [['#7DF2C9', -0.2, 0], ['#A98BFF', 0.35, 1.3], ['#6FD6F2', 0.75, 2.4]].forEach(([color, y, ph]) => {
    const geo = new THREE.PlaneGeometry(9, 1.3, 90, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { t: { value: 0 }, c: { value: new THREE.Color(color) }, ph: { value: ph } },
      vertexShader: 'uniform float t; uniform float ph; varying vec2 vUv; void main(){ vUv=uv; vec3 p=position; p.y+=sin(p.x*0.9+t*0.5+ph)*0.35; p.z+=cos(p.x*0.6+t*0.3+ph)*0.5; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);} ',
      fragmentShader: 'uniform vec3 c; uniform float t; varying vec2 vUv; void main(){ float a=smoothstep(0.0,0.35,vUv.y)*(1.0-smoothstep(0.45,1.0,vUv.y)); a*=0.35+0.65*pow(0.5+0.5*sin(vUv.x*70.0+sin(vUv.x*9.0+t*0.7)*3.0),2.0); gl_FragColor=vec4(c, a*0.5);} '
    });
    mats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, 1.2 + y, -3.4 - y); m.rotation.z = 0.18;
    g.add(m);
  });
  tickers.push(t => mats.forEach(m => { m.uniforms.t.value = t; }));
  return g;
}

function eclipse() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const r = x.createRadialGradient(128, 128, 40, 128, 128, 126);
  r.addColorStop(0, 'rgba(255,240,210,0)'); r.addColorStop(0.42, 'rgba(255,231,190,1)'); r.addColorStop(0.5, 'rgba(255,214,160,0.55)'); r.addColorStop(1, 'rgba(255,200,150,0)');
  x.fillStyle = r; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#120E1C'; x.beginPath(); x.arc(128, 128, 52, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.position.set(2.1, 1.5, -3.5); s.scale.setScalar(2.2);
  return s;
}

/* ----------------------------------------------------------------- moons */
function moonBall(r, color, ink = 0.06) {
  const m = mesh(new THREE.IcosahedronGeometry(r, 3), toon(color), { ink });
  for (let i = 0; i < 3; i++) {
    const cr = mesh(new THREE.CircleGeometry(r * (0.18 + i * 0.07), 12), toon(shade(color, 0.88)));
    const d = new THREE.Vector3(Math.sin(i * 2.1), Math.cos(i * 1.3) * 0.6, 0.8).normalize();
    cr.position.copy(d.multiplyScalar(r * 1.003)); cr.lookAt(cr.position.clone().multiplyScalar(2));
    m.add(cr);
  }
  return m;
}
function orbit(obj, radius, speed, tilt, phase, tickers) {
  const pivot = new THREE.Group();
  obj.position.set(radius, 0, 0);
  pivot.add(obj);
  const holder = group(pivot); holder.rotation.set(tilt, 0, tilt * 0.6);
  tickers.push(t => { pivot.rotation.y = phase + t * speed; });
  return holder;
}
function rings(pal) {
  const g = new THREE.Group();
  const geo = new THREE.RingGeometry(1.38, 1.9, 128, 6);
  const cols = [], p = geo.attributes.position, c = new THREE.Color();
  const bands = pal.dark ? ['#B9B4E8', '#8E9AD6', '#D7C9F2', '#A5C8E8'] : ['#E8CFE0', '#C9D6F0', '#F3E0C2', '#D7CCF0'];
  for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); c.set(bands[Math.floor((r - 1.38) / 0.52 * 7) % bands.length]); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false })));
  // Ink orbit lines at the edges, in the hand-drawn flash style.
  for (const r of [1.36, 1.93, 2.08]) {
    const pts = []; for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    g.add(line(pts, pal.dark ? '#E6E3FF' : '#6B6386', r > 2 ? 0.35 : 0.6));
  }
  g.rotation.set(Math.PI / 2 - 0.42, 0.18, 0);
  return g;
}
function buildMoons(id, spec, tickers, rand, pal) {
  const g = new THREE.Group();
  const pearl = pal.dark ? '#EDE8FF' : '#F4EEDF';
  if (id === 'one' || id === 'ringmoon') g.add(orbit(moonBall(0.13, pearl), 2.0, 0.22, 0.35, 1.2, tickers));
  if (id === 'twin') {
    g.add(orbit(moonBall(0.12, pearl), 1.95, 0.22, 0.3, 0.6, tickers));
    g.add(orbit(moonBall(0.085, '#D9CCF6'), 2.35, 0.16, -0.25, 3.4, tickers));
  }
  if (id === 'rings' || id === 'ringmoon') { const r = rings(pal); g.add(r); tickers.push(t => { r.rotation.z = t * 0.03; }); }
  if (id === 'comet') {
    const head = mesh(new THREE.IcosahedronGeometry(0.045, 2), glow('#F2FBFF'));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#BDE6FF', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    tail.rotation.x = -Math.PI / 2; tail.position.z = 0.25;
    const comet = group(head, tail);
    const pivot = group(comet);
    const holder = group(pivot); holder.rotation.set(0.5, 0, -0.3);
    tickers.push(t => { const a = t * 0.12 + 2; comet.position.set(Math.cos(a) * 2.3, 0, Math.sin(a) * 1.2); comet.rotation.y = Math.atan2(Math.sin(a) * 2.3, -Math.cos(a) * 1.2); });
    g.add(holder);
  }
  if (id === 'crescent') {
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.32, Math.PI * 0.5, Math.PI * 1.5, false);
    s.absarc(0.13, 0, 0.26, Math.PI * 1.5, Math.PI * 0.5, true);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 24 });
    geo.center();
    const m = mesh(geo, toon('#F7DC8A', { emissive: '#F2C25E', emissiveIntensity: 0.25 }), { ink: 0.05 });
    const holder = group(m); holder.position.set(-1.65, 1.15, -0.3); holder.rotation.z = -0.5;
    tickers.push(t => { m.position.y = Math.sin(t * 0.8) * 0.05; m.rotation.y = Math.sin(t * 0.4) * 0.25; });
    g.add(holder);
  }
  if (id === 'moonlets') {
    for (let k = 0; k < 5; k++) g.add(orbit(moonBall(0.04 + (k % 2) * 0.012, k % 2 ? '#D9CCF6' : pearl, 0.08), 1.75, 0.2, 0.42, 0.5 + k * 0.34, tickers));
  }
  if (id === 'sibling') {
    const geo = new THREE.IcosahedronGeometry(0.2, 4), cols = [], pp = geo.attributes.position, cc = new THREE.Color();
    for (let i = 0; i < pp.count; i++) { const yy = pp.getY(i) / 0.2; cc.set(Math.sin(yy * 7) > 0.2 ? (pal.dark ? '#B9A6E8' : '#F2C9B8') : (pal.dark ? '#8E9AD6' : '#E8B7C6')); cols.push(cc.r, cc.g, cc.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const sis = mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon('#fff').gradientMap }), { ink: 0.05 });
    const ring = mesh(new THREE.RingGeometry(0.27, 0.36, 48), new THREE.MeshBasicMaterial({ color: pal.dark ? '#D7CCF2' : '#F3E0C2', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }), { rot: [Math.PI / 2 - 0.5, 0, 0.2] });
    const body = group(sis, ring);
    tickers.push(t => { sis.rotation.y = t * 0.3; });
    g.add(orbit(body, 2.45, 0.07, 0.28, 2.2, tickers));
  }
  if (id === 'sun2') {
    const sun = group(mesh(new THREE.IcosahedronGeometry(0.11, 3), glow('#FFD58A')));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('dot'), color: '#FFC37A', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.9); sun.add(halo);
    const light = new THREE.PointLight('#FFB877', 2.2, 4, 1.5); sun.add(light);
    g.add(orbit(sun, 2.0, 0.15, -0.4, 4.0, tickers));
  }
  return g;
}

/* ----------------------------------------------------------------- air */
function buildAir(id, spec, surface, tickers, rand, pal, landDirs) {
  const g = new THREE.Group();
  const shellPts = (n, rMin, rMax) => { const p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const d = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(rMin + rand() * (rMax - rMin)); p.set([d.x, d.y, d.z], i * 3); } return p; };
  const fallInward = (pts, speed, rMin, rMax, swirl = 0) => {
    const a = pts.geometry.attributes.position, v = new THREE.Vector3();
    tickers.push((t, dt) => {
      for (let i = 0; i < a.count; i++) {
        v.fromBufferAttribute(a, i);
        let r = v.length() - speed * dt;
        if (r < rMin) r = rMax;
        v.setLength(r);
        if (swirl) v.applyAxisAngle(new THREE.Vector3(0, 1, 0), swirl * dt);
        a.setXYZ(i, v.x, v.y, v.z);
      }
      a.needsUpdate = true;
    });
  };
  switch (id) {
    case 'clouds': {
      for (let i = 0; i < 8; i++) {
        const cl = new THREE.Group();
        const k = 3 + Math.floor(rand() * 3);
        for (let j = 0; j < k; j++) cl.add(mesh(new THREE.IcosahedronGeometry(0.04 + rand() * 0.03, 2), toon(pal.dark ? '#C9CDE8' : '#FFFFFF'), { pos: [(j - k / 2) * 0.05, rand() * 0.025, rand() * 0.02], ink: 0.04 }));
        const holder = orbit(cl, 1.34 + rand() * 0.12, 0.05 + rand() * 0.05, (rand() - 0.5) * 1.6, rand() * 6, tickers);
        g.add(holder);
      }
      break;
    }
    case 'snow': { const p = points(shellPts(380, 1.02, 2.0), { size: 0.045, color: '#FFFFFF', shape: 'flake' }); g.add(p); fallInward(p, 0.12, 1.02, 2.0, 0.05); break; }
    case 'petals': { const p = points(shellPts(240, 1.02, 2.0), { size: 0.05, color: '#F7B9CC', shape: 'petal' }); g.add(p); fallInward(p, 0.09, 1.02, 2.0, 0.25); break; }
    case 'rain': {
      const n = 130, p = new Float32Array(n * 6), base = [];
      for (let i = 0; i < n; i++) { const d = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(); base.push({ d, r: 1.05 + rand() * 0.9 }); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#B9D3F0', transparent: true, opacity: 0.38 }));
      g.add(ls);
      tickers.push((t, dt) => { base.forEach((b, i) => { b.r -= dt * 0.9; if (b.r < 1.02) b.r = 1.95; const a = b.d.clone().multiplyScalar(b.r), c = b.d.clone().multiplyScalar(b.r + 0.035); p.set([a.x, a.y, a.z, c.x, c.y, c.z], i * 6); }); geo.attributes.position.needsUpdate = true; });
      break;
    }
    case 'fireflies': {
      const n = 90, p = new Float32Array(n * 3), base = [];
      for (let i = 0; i < n; i++) { const d = landDirs[(i * 7) % landDirs.length] || new THREE.Vector3(0, 1, 0); base.push({ d, h: 0.04 + rand() * 0.18, ph: rand() * 6 }); }
      const pts = points(p, { size: 0.06, color: '#E9FF9C', additive: true });
      g.add(pts);
      tickers.push(t => { base.forEach((b, i) => { const q = b.d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.3 + b.ph) * 0.06).multiplyScalar(surface(b.d) + b.h + Math.sin(t + b.ph) * 0.03); p.set([q.x, q.y, q.z], i * 3); }); pts.geometry.attributes.position.needsUpdate = true; pts.material.opacity = 0.75 + 0.25 * Math.sin(t * 3); });
      break;
    }
    case 'rainbow': {
      const bow = new THREE.Group();
      ['#F4A7B0', '#F6C99A', '#F7E39C', '#B7E2B0', '#A9CDF0', '#C7B4F0'].forEach((col, i) => bow.add(mesh(new THREE.TorusGeometry(0.62 - i * 0.035, 0.016, 6, 64, Math.PI), toon(col, { opacity: 0.9 }))));
      const holder = group(bow);
      const d = new THREE.Vector3(-0.2, 0.55, 0.8).normalize();
      stand(holder, d, 0.9, 0.2);
      bow.rotation.y = 0.5;
      g.add(holder);
      break;
    }
    case 'meteors': {
      const streaks = [];
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.02), new THREE.MeshBasicMaterial({ color: '#FFF4D6', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        g.add(s); streaks.push({ s, ph: i / 4 });
      }
      tickers.push(t => streaks.forEach((m, i) => {
        const k = (t * 0.22 + m.ph) % 1;
        m.s.position.set(2.6 - k * 5.2 + i * 0.3, 2.2 - k * 2.6 - i * 0.25, -1.5 - i * 0.4);
        m.s.rotation.z = 0.48;
        m.s.material.opacity = k < 0.6 ? Math.sin(k / 0.6 * Math.PI) * 0.9 : 0;
      }));
      // Meteors belong to the sky around the world, not to the world: re-parented by the stage.
      g.userData.skyFixed = true;
      break;
    }
    case 'skylanterns': {
      const n = 16, base = [];
      const from = spec.flags.lanternTrail ? SPOTS.dwelling : null;
      for (let i = 0; i < n; i++) {
        const lan = group(mesh(new THREE.BoxGeometry(0.026, 0.034, 0.026), glow(['#FFD27A', '#FFC48A', '#FFE29E'][i % 3])), halo('#FFC870', 0.1, 0.55));
        g.add(lan);
        const d = from ? from.clone().add(new THREE.Vector3((rand() - 0.5) * 0.35, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.35)).normalize() : landDirs[(i * 17) % landDirs.length] || new THREE.Vector3(0, 1, 0);
        base.push({ lan, d, ph: rand() });
      }
      tickers.push(t => base.forEach((o, i) => { const k = (t * 0.06 + o.ph) % 1; o.lan.position.copy(o.d).multiplyScalar(surface(o.d) + 0.04 + k * 1.1); o.lan.position.x += Math.sin(t * 0.8 + i) * 0.02 * k; o.lan.scale.setScalar(k > 0.85 ? Math.max(0.001, 1 - (k - 0.85) / 0.15) : Math.min(1, k * 8)); }));
      break;
    }
    case 'dandelion': {
      const p = points(shellPts(150, 1.05, 1.9), { size: 0.075, color: pal.dark ? '#F2F0FF' : '#FFFFFF', shape: 'seed', opacity: 0.95 });
      g.add(p);
      const a = p.geometry.attributes.position, v = new THREE.Vector3(), up = new THREE.Vector3(0.3, 1, 0.2).normalize();
      tickers.push((t, dt) => { for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i); v.applyAxisAngle(up, dt * (0.05 + (i % 5) * 0.012)); v.setLength(v.length() + Math.sin(t * 0.7 + i) * 0.0008); a.setXYZ(i, v.x, v.y, v.z); } a.needsUpdate = true; });
      break;
    }
    case 'bubbles': {
      const n = 26, base = [];
      for (let i = 0; i < n; i++) {
        const b = mesh(new THREE.IcosahedronGeometry(0.03 + rand() * 0.03, 2), new THREE.MeshToonMaterial({ color: ['#D6F0FF', '#FFE0F0', '#E8E0FF'][i % 3], transparent: true, opacity: 0.5, gradientMap: toon('#fff').gradientMap }));
        g.add(b); base.push({ b, d: landDirs[(i * 13) % landDirs.length] || new THREE.Vector3(0, 1, 0), ph: rand() });
      }
      tickers.push(t => base.forEach(o => { const k = (t * 0.12 + o.ph) % 1; o.b.position.copy(o.d).multiplyScalar(surface(o.d) + 0.05 + k * 0.8); o.b.scale.setScalar(k > 0.92 ? 1 + (k - 0.92) * 8 : 1); o.b.material.opacity = k > 0.92 ? 0.5 * (1 - (k - 0.92) / 0.08) : 0.5; }));
      break;
    }
  }
  return g;
}

/* ----------------------------------------------------------------- visitors */
function crane(color) {
  const mat = toon(color, { flat: true, side: THREE.DoubleSide });
  const tri = (a, b, c) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3)); geo.computeVertexNormals(); return edges(new THREE.Mesh(geo, mat), '#3B4C9A'); };
  const body = group(
    tri([-0.2, 0, 0], [0.2, 0, 0], [0, -0.13, 0.04]), tri([-0.2, 0, 0], [0.2, 0, 0], [0, -0.13, -0.04]),
    tri([0.1, 0, 0], [0.18, 0, 0], [0.42, 0.32, 0]), tri([0.42, 0.32, 0], [0.38, 0.3, 0], [0.48, 0.26, 0]),
    tri([-0.1, 0, 0], [-0.2, 0, 0], [-0.44, 0.26, 0])
  );
  const wingL = group(tri([-0.14, 0, 0], [0.14, 0, 0], [0, 0.04, 0.5]));
  const wingR = group(tri([-0.14, 0, 0], [0.14, 0, 0], [0, 0.04, -0.5]));
  const c = group(body, wingL, wingR);
  c.userData.wings = [wingL, wingR];
  c.scale.setScalar(0.34);
  return c;
}
function buildVisitor(id, spec, surface, tickers, rand, pal) {
  const g = new THREE.Group();
  const ink = 0.05;
  const flyAround = (obj, r, speed, tilt, phase, bob = 0.04) => {
    const pivot = new THREE.Group(); pivot.add(obj);
    const holder = group(pivot); holder.rotation.set(tilt, 0, tilt * 0.5);
    tickers.push(t => { const a = phase + t * speed; obj.position.set(Math.cos(a) * r, Math.sin(t * 1.3 + phase) * bob, -Math.sin(a) * r); obj.rotation.y = a + (speed > 0 ? 0 : Math.PI); });
    g.add(holder);
  };
  switch (id) {
    case 'whale': {
      const body = mesh(new THREE.SphereGeometry(0.1, 20, 14), toon('#A8B8EA'), { scale: [2.1, 0.95, 1], ink });
      const belly = mesh(new THREE.SphereGeometry(0.096, 18, 12), toon('#EEF1FF'), { scale: [1.9, 0.75, 0.9], pos: [0.01, -0.022, 0] });
      const tail = mesh(new THREE.ConeGeometry(0.07, 0.12, 4), toon('#97A8E0'), { rot: [Math.PI / 2, 0, Math.PI / 2], pos: [-0.24, 0.02, 0], scale: [1, 1, 0.25], ink });
      const fin = mesh(new THREE.SphereGeometry(0.04, 8, 6), toon('#97A8E0'), { pos: [0.04, -0.06, 0.09], scale: [1.4, 0.3, 0.8] });
      const eye = mesh(new THREE.SphereGeometry(0.009, 6, 6), toon('#2B2950'), { pos: [0.16, 0.0, 0.07] });
      const eye2 = eye.clone(); eye2.position.z = -0.07;
      const whale = group(body, belly, tail, fin, eye, eye2);
      // rotate so +x (nose) points along -z travel... flyAround sets rotation.y; nose along +x means facing tangent when y=a.
      whale.rotation.y = Math.PI / 2; // nose (+x) faces the direction of travel (-z)
      tickers.push(t => { tail.rotation.y = Math.sin(t * 2) * 0.3; });
      flyAround(group(whale), spec.flags.whaleLow ? 1.38 : 1.62, 0.12, 0.25, 0.8, 0.06);
      break;
    }
    case 'cranes': {
      const cols = ['#F6F3EA', '#AFC6F2', '#F4E08A', '#BDE3F0', '#F6F3EA'];
      cols.forEach((col, i) => {
        const c = crane(col);
        tickers.push(t => { const f = Math.sin(t * 5 + i) * 0.5; c.userData.wings[0].rotation.x = f; c.userData.wings[1].rotation.x = -f; });
        const holder = group(c); holder.rotation.y = Math.PI / 2;
        flyAround(group(holder), spec.flags.perch && i < 2 ? 1.15 : 1.42 + i * 0.05, 0.2, 0.4 - i * 0.12, i * 0.45);
      });
      break;
    }
    case 'jelly': {
      for (let i = 0; i < 4; i++) {
        const col = ['#F7B6D6', '#C6B4F6', '#A8E1F2', '#FFD3B0'][i];
        const dome = mesh(new THREE.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(col, { opacity: 0.85, emissive: col, emissiveIntensity: 0.35 }), { ink: 0.06 });
        const j = group(dome);
        for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; j.add(line([new THREE.Vector3(Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035), new THREE.Vector3(Math.cos(a) * 0.03, -0.06, Math.sin(a) * 0.03), new THREE.Vector3(Math.cos(a) * 0.04, -0.12, Math.sin(a) * 0.04)], col, 0.8)); }
        const d = new THREE.Vector3(Math.cos(i * 1.6), 0.4 - i * 0.25, Math.sin(i * 1.6)).normalize();
        const holder = group(j); stand(holder, d, 1.45 + (i % 2) * 0.15);
        tickers.push(t => { j.position.y = Math.sin(t * 0.9 + i) * 0.06; dome.scale.set(1 + Math.sin(t * 2.4 + i) * 0.08, 1 - Math.sin(t * 2.4 + i) * 0.08, 1 + Math.sin(t * 2.4 + i) * 0.08); });
        g.add(holder);
      }
      break;
    }
    case 'koi': {
      for (let i = 0; i < 3; i++) {
        const body = mesh(new THREE.SphereGeometry(0.05, 14, 10), toon('#FFF6EE'), { scale: [1.9, 0.62, 0.72], ink });
        const patch = mesh(new THREE.SphereGeometry(0.046, 12, 8), toon(i === 1 ? '#3E3448' : '#F08A5D'), { scale: [1.1, 0.5, 0.62], pos: [0.03, 0.012, 0] });
        const tail = mesh(new THREE.ConeGeometry(0.035, 0.07, 3), toon('#F4A47E', { side: THREE.DoubleSide }), { rot: [0, 0, Math.PI / 2], pos: [-0.11, 0, 0], scale: [1, 1, 0.15] });
        const koi = group(body, patch, tail);
        tickers.push(t => { tail.rotation.y = Math.sin(t * 6 + i) * 0.5; koi.rotation.y = Math.sin(t * 3 + i) * 0.12; });
        const holder = group(koi); holder.rotation.y = Math.PI / 2;
        flyAround(group(holder), 1.36 + i * 0.03, 0.32, 0.9 - i * 0.05, i * 0.4, 0.03);
      }
      break;
    }
    case 'birds': {
      for (let i = 0; i < 9; i++) {
        const mat = toon(pal.dark ? '#E7E4FF' : '#5D5677', { side: THREE.DoubleSide });
        const wl = mesh(new THREE.PlaneGeometry(0.06, 0.016), mat, { pos: [0, 0, 0.028], rot: [Math.PI / 2, 0, 0] });
        const wr = mesh(new THREE.PlaneGeometry(0.06, 0.016), mat, { pos: [0, 0, -0.028], rot: [Math.PI / 2, 0, 0] });
        const pl = group(wl), pr = group(wr);
        const bird = group(pl, pr);
        tickers.push(t => { const f = Math.sin(t * 8 + i) * 0.6; pl.rotation.x = f; pr.rotation.x = -f; });
        const holder = group(bird); holder.rotation.y = Math.PI / 2;
        flyAround(group(holder), 1.5 + (i % 3) * 0.06, 0.25, 0.5 + (i % 3) * 0.05, Math.floor(i / 3) * 0.12 + (i % 3) * 0.05, 0.02);
      }
      break;
    }
    case 'balloon': {
      const geo = new THREE.SphereGeometry(0.11, 16, 14);
      const cols = [], p = geo.attributes.position, c = new THREE.Color();
      for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); c.set(Math.floor((a + Math.PI) / (Math.PI / 4)) % 2 ? '#F4A7B0' : '#FFF4E4'); cols.push(c.r, c.g, c.b); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const env = mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon('#fff').gradientMap }), { scale: [1, 1.15, 1], ink });
      const basket = mesh(new THREE.BoxGeometry(0.045, 0.035, 0.045), toon('#B98D6E'), { pos: [0, -0.2, 0], ink: 0.1 });
      const b = group(env, basket);
      for (const [x, z] of [[0.02, 0.02], [-0.02, 0.02], [0.02, -0.02], [-0.02, -0.02]]) b.add(line([new THREE.Vector3(x, -0.18, z), new THREE.Vector3(x * 3, -0.09, z * 3)], '#6B5B6E'));
      flyAround(b, 1.7, 0.07, 0.35, 0.3, 0.05);
      break;
    }
    case 'butterflies': {
      const cols = ['#F7B6D6', '#A9CDF0', '#F6DE97', '#C6B4F6', '#B9E3B0', '#FFFFFF'];
      cols.forEach((col, i) => {
        const wm = toon(col, { side: THREE.DoubleSide });
        const wing = sx => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(sx * 0.03, 0.035, sx * 0.07, 0.03, sx * 0.06, -0.002); sh.bezierCurveTo(sx * 0.055, -0.03, sx * 0.02, -0.035, 0, -0.006); const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), wm); m.rotation.x = -Math.PI / 2; return group(m); };
        const L = wing(-1), Rw = wing(1);
        const bf = group(L, Rw, mesh(new THREE.CapsuleGeometry(0.004, 0.03, 3, 6), toon('#4A4560'), { rot: [0, 0, Math.PI / 2] }));
        tickers.push(t => { const f = Math.sin(t * 11 + i * 1.7) * 0.9; L.rotation.x = f; Rw.rotation.x = -f; });
        const holder = group(bf); holder.rotation.y = Math.PI / 2;
        flyAround(group(holder), 1.16 + (i % 3) * 0.05, 0.16 + (i % 2) * 0.05, 0.9 - i * 0.32, i * 1.1, 0.05);
      });
      break;
    }
    case 'owl': {
      const brown = toon('#B39A86'), cream = toon('#F4EADC'), dark = toon('#3E3448');
      const eyeL = mesh(new THREE.SphereGeometry(0.014, 10, 8), toon('#FFFFFF'), { pos: [-0.017, 0.085, 0.034] }), eyeR = mesh(new THREE.SphereGeometry(0.014, 10, 8), toon('#FFFFFF'), { pos: [0.017, 0.085, 0.034] });
      eyeL.add(mesh(new THREE.SphereGeometry(0.007, 8, 6), dark, { pos: [0, 0, 0.01] })); eyeR.add(mesh(new THREE.SphereGeometry(0.007, 8, 6), dark, { pos: [0, 0, 0.01] }));
      const owl = group(
        mesh(new THREE.SphereGeometry(0.042, 14, 10), brown, { pos: [0, 0.05, 0], scale: [1, 1.2, 0.9], ink: 0.08 }),
        mesh(new THREE.SphereGeometry(0.03, 12, 8), cream, { pos: [0, 0.045, 0.02], scale: [1, 1.2, 0.7] }),
        mesh(new THREE.ConeGeometry(0.01, 0.022, 4), brown, { pos: [-0.024, 0.11, 0], rot: [0, 0, 0.3] }), mesh(new THREE.ConeGeometry(0.01, 0.022, 4), brown, { pos: [0.024, 0.11, 0], rot: [0, 0, -0.3] }),
        mesh(new THREE.ConeGeometry(0.006, 0.012, 4), toon('#E6B66A'), { pos: [0, 0.073, 0.042], rot: [Math.PI / 2 + 0.3, 0, 0] }),
        eyeL, eyeR,
        mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 5), toon('#8E6E5E'), { pos: [0, 0.008, 0], rot: [0, 0, Math.PI / 2] })
      );
      const d = SPOTS.dwelling.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.32).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.25).normalize();
      stand(owl, d, surface(d) + 0.08, 0.4);
      const perch = mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.09, 5), toon('#8E6E5E'), { pos: [0, -0.045, 0] }); owl.add(perch);
      const awake = spec.flags.owlAwake;
      tickers.push(t => { const blink = (t % 3.7) < 0.12 ? 0.1 : (awake ? 1 : 0.35); eyeL.scale.y = eyeR.scale.y = blink; owl.rotation.y = 0.4 + Math.sin(t * 0.5) * 0.35; });
      g.add(owl);
      break;
    }
    case 'dragon': {
      const segs = [], n = 18, body = toon('#A8DCCB'), belly = toon('#F3EBDD');
      for (let i = 0; i < n; i++) {
        const r = 0.04 * (1 - i / n * 0.75);
        const seg = mesh(new THREE.SphereGeometry(r, 12, 9), i % 3 === 1 ? belly : body, { ink: 0.07 });
        if (i % 3 === 0 && i > 0 && i < n - 2) seg.add(mesh(new THREE.ConeGeometry(r * 0.5, r * 1.2, 4), toon('#F3C27A'), { pos: [0, r * 0.9, 0] }));
        g.add(seg); segs.push(seg);
      }
      const head = segs[0];
      head.scale.set(1.25, 1, 1.4);
      head.add(mesh(new THREE.ConeGeometry(0.008, 0.035, 5), toon('#F3C27A'), { pos: [-0.015, 0.04, -0.01], rot: [-0.5, 0, 0.3] }), mesh(new THREE.ConeGeometry(0.008, 0.035, 5), toon('#F3C27A'), { pos: [0.015, 0.04, -0.01], rot: [-0.5, 0, -0.3] }));
      head.add(mesh(new THREE.SphereGeometry(0.007, 6, 6), toon('#2B2950'), { pos: [-0.02, 0.012, 0.025] }), mesh(new THREE.SphereGeometry(0.007, 6, 6), toon('#2B2950'), { pos: [0.02, 0.012, 0.025] }));
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0, -0.25)), nx = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
      const at = (a, k, out) => out.set(Math.cos(a) * 1.5, Math.sin(a * 3 + k * 0.4) * 0.09, -Math.sin(a) * 1.5).applyQuaternion(tilt);
      tickers.push(t => { segs.forEach((sg, i) => { const a = t * 0.18 - i * 0.055; at(a, i, sg.position); if (i === 0) { at(a + 0.02, 0, nx).sub(sg.position).normalize(); sg.quaternion.setFromUnitVectors(Z, nx); } }); });
      break;
    }
    case 'fox': {
      const orange = toon('#EE9A5F'), white = toon('#FFF6EE');
      const fox = group(
        mesh(new THREE.SphereGeometry(0.045, 14, 10), orange, { scale: [1.4, 0.7, 1], pos: [0, 0.03, 0], ink: 0.08 }),
        mesh(new THREE.SphereGeometry(0.03, 12, 10), orange, { pos: [0.055, 0.035, 0.02], ink: 0.08 }),
        mesh(new THREE.ConeGeometry(0.012, 0.025, 4), orange, { pos: [0.06, 0.068, 0.005] }),
        mesh(new THREE.ConeGeometry(0.012, 0.025, 4), orange, { pos: [0.065, 0.065, 0.035] }),
        mesh(new THREE.SphereGeometry(0.03, 12, 10), orange, { scale: [1.8, 0.7, 0.8], pos: [-0.02, 0.025, 0.055], rot: [0, 0.8, 0], ink: 0.08 }),
        mesh(new THREE.SphereGeometry(0.016, 10, 8), white, { pos: [0.03, 0.025, 0.08] })
      );
      const d = SPOTS.dwelling.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), spec.flags.foxHome ? 0.2 : -0.45).normalize();
      stand(fox, d, surface(d) - 0.004, 1.2);
      const zz = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('dot'), color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
      zz.scale.setScalar(0.03); fox.add(zz);
      tickers.push(t => { const k = (t * 0.3) % 1; zz.position.set(0.06, 0.08 + k * 0.1, 0.02); zz.material.opacity = 0.7 * (1 - k); fox.children[0].scale.y = 0.7 + Math.sin(t * 1.5) * 0.03; });
      g.add(fox);
      break;
    }
  }
  return g;
}
