// Rendering kit: the illustrated look (soft toon shading + ink outline), shared by all recipes.
import * as THREE from '../../vendor/three.module.min.js';

export { THREE };

const gradient = (() => {
  const data = new Uint8Array([150, 200, 235, 255]);
  const t = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

const cache = new Map();
/** Soft toon material. opts: emissive, opacity, vertexColors, flat */
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: gradient,
    vertexColors: !!opts.vertexColors,
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive || '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? (opts.emissive ? 1 : 0),
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? !(opts.opacity != null && opts.opacity < 1)
  });
  cache.set(key, m);
  return m;
}

export function glow(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
}

let inkColor = new THREE.Color('#4C4563');
const inkMats = [];
export function setInk(hex) {
  inkColor = new THREE.Color(hex);
  inkMats.forEach(m => m.color.copy(inkColor));
}
export function inkMaterial() { return inkMat(); }
function inkMat() {
  const m = new THREE.MeshBasicMaterial({ color: inkColor.clone(), side: THREE.BackSide });
  inkMats.push(m);
  return m;
}

/** Inverted-hull ink outline. Works well for roughly convex, centred geometry. */
export function outline(mesh, k = 0.06) {
  const hull = new THREE.Mesh(mesh.geometry, inkMat());
  hull.scale.setScalar(1 + k);
  hull.userData.outline = true;
  hull.raycast = () => {};
  mesh.add(hull);
  return mesh;
}

export function mesh(geo, mat, { ink = 0, pos, rot, scale } = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale != null) typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale);
  if (ink) outline(m, ink);
  return m;
}

export function group(...kids) {
  const g = new THREE.Group();
  kids.flat().filter(Boolean).forEach(k => g.add(k));
  return g;
}

/** Place an object on the sphere surface at direction `dir`, standing up along the normal. */
export function stand(obj, dir, radius, spin = 0) {
  const n = dir.clone().normalize();
  obj.position.copy(n).multiplyScalar(radius);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  if (spin) obj.rotateY(spin);
  return obj;
}

export function mixHex(a, b, t) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}
export function shade(a, k) {
  const c = new THREE.Color(a); c.multiplyScalar(k);
  return '#' + c.getHexString();
}

/* ---------- seeded value noise (3D) ---------- */
export function noise3(rand) {
  const P = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
  for (let i = 0; i < 512; i++) P[i] = base[i & 255];
  const V = Float32Array.from({ length: 256 }, () => rand() * 2 - 1);
  const fade = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const at = (x, y, z) => V[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
  function n(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
    return lerp(
      lerp(lerp(at(xi, yi, zi), at(xi + 1, yi, zi), xf), lerp(at(xi, yi + 1, zi), at(xi + 1, yi + 1, zi), xf), yf),
      lerp(lerp(at(xi, yi, zi + 1), at(xi + 1, yi, zi + 1), xf), lerp(at(xi, yi + 1, zi + 1), at(xi + 1, yi + 1, zi + 1), xf), yf), zf);
  }
  return (x, y, z, oct = 3) => {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
    return s;
  };
}

/** Fibonacci-sphere directions. */
export function fib(n) {
  const out = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), t = g * i;
    out.push(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r));
  }
  return out;
}

/** A soft round sprite texture for particles; shape: 'dot' | 'star' | 'petal' | 'flake' */
export function spriteTex(shape = 'dot', color = '#ffffff') {
  const key = 'tex:' + shape + color;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  g.fillStyle = color;
  if (shape === 'dot') {
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    r.addColorStop(0, color); r.addColorStop(0.35, color); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill();
  } else if (shape === 'star') {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? 6 : 29; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill();
  } else if (shape === 'petal') {
    g.beginPath(); g.ellipse(0, 0, 13, 24, 0.5, 0, 7); g.fill();
  } else if (shape === 'seed') { // a dandelion seed: a fine fan of threads above a short stem
    g.strokeStyle = color; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let i = 0; i < 11; i++) { const a = -Math.PI * 0.9 + i / 10 * Math.PI * 0.8; g.beginPath(); g.moveTo(0, 6); g.lineTo(Math.cos(a) * 26, 6 + Math.sin(a) * 26); g.stroke(); }
    g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, 6); g.lineTo(0, 28); g.stroke();
  } else if (shape === 'square') {
    g.fillRect(-16, -11, 32, 22);
  } else if (shape === 'flake') {
    g.strokeStyle = color; g.lineWidth = 5; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-24, 0); g.lineTo(24, 0); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export function points(positions, { size = 0.05, color = '#ffffff', shape = 'dot', opacity = 1, additive = false } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size, map: spriteTex(shape, '#ffffff'), color, transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, alphaTest: 0.02
  });
  return new THREE.Points(geo, mat);
}

/**
 * Give a toon material more volume: a soft fresnel rim (light caught at the edge) and, optionally,
 * a per-vertex glow read from a float attribute `aGlow` (e.g. lava seams). Returns a handle with the live uniforms.
 */
export function enrich(mat, { rim = null, rimK = 0.5, rimPow = 2.6, glow = null } = {}) {
  const u = { uRim: { value: new THREE.Color(rim || '#ffffff') }, uRimK: { value: rim ? rimK : 0 }, uRimPow: { value: rimPow },
    uGlow: { value: new THREE.Color(glow || '#000000') }, uGlowK: { value: glow ? 1 : 0 } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    if (glow) sh.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGlow = aGlow;');
    sh.fragmentShader = 'uniform vec3 uRim; uniform float uRimK; uniform float uRimPow; uniform vec3 uGlow; uniform float uGlowK;\n' + (glow ? 'varying float vGlow;\n' : '') +
      sh.fragmentShader
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (glow ? '\ttotalEmissiveRadiance += uGlow * vGlow * uGlowK;\n' : ''))
        .replace('#include <opaque_fragment>', '\t{ float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), uRimPow); outgoingLight += uRim * fr * uRimK; }\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'enrich' + (glow ? 'g' : '') + (rim ? 'r' : '');
  mat.needsUpdate = true;
  return u;
}

/** Cast and receive soft shadows on everything solid under `root` (not ink hulls, glows, particles or glass). */
export function shadows(root, { receive = true, skip = () => false } = {}) {
  root.traverse(o => {
    if (!(o.isMesh || o.isInstancedMesh) || o.userData.outline || o.userData.inkHull || skip(o)) return;
    const m = o.material;
    if (!m || m.transparent || m.blending === THREE.AdditiveBlending || m.side === THREE.BackSide || m.isMeshBasicMaterial || m.isShaderMaterial) return;
    o.castShadow = true;
    o.receiveShadow = receive;
  });
}

/** A key light that casts soft shadows over a box of half-size `r` around the origin. */
export function shadowKey(light, r = 2, size = 1024) {
  light.castShadow = true;
  light.shadow.mapSize.set(size, size);
  const c = light.shadow.camera;
  c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 0.5; c.far = 20;
  light.shadow.bias = -0.0006; light.shadow.normalBias = 0.012; light.shadow.radius = 3;
  c.updateProjectionMatrix();
  return light;
}

/** A soft additive halo (fake bloom) for small lights. */
export function halo(color = '#FFE3A0', size = 0.12, opacity = 0.7) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex('dot', '#ffffff'), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  s.raycast = () => {};
  return s;
}

export const ease = {
  outBack: k => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outCubic: k => 1 - Math.pow(1 - k, 3),
  inOut: k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
};

/** Merge duplicate vertices so normals are smooth (Polyhedron geometries come non-indexed). */
export function indexed(geo) {
  const p = geo.attributes.position, map = new Map(), out = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 1e5) + ',' + Math.round(p.getY(i) * 1e5) + ',' + Math.round(p.getZ(i) * 1e5);
    let j = map.get(k);
    if (j === undefined) { j = out.length / 3; map.set(k, j); out.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.setIndex(idx);
  return g;
}
