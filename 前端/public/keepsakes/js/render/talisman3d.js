// Two-Person Talisman renderer. Deterministic: (spec, seed) -> the same charm every time.
// Jewellery is rendered physically (metal, glass, pearl, silk) against a small procedural studio environment;
// the paper-and-ink stage around it stays the same as every other recipe.
import { THREE, mixHex } from './kit.js';
import { rngFor } from '../engine/codec.js';
export { THREE };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const at = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };

/* ---------------- studio environment (for reflections) ---------------- */
let envCache = null;
function studio(renderer) {
  if (!renderer) return null;
  if (envCache && envCache.renderer === renderer) return envCache.tex;
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const cols = [], p = geo.attributes.position, c = new THREE.Color(), top = new THREE.Color('#FFFFFF'), low = new THREE.Color('#8E8698');
  for (let i = 0; i < p.count; i++) { c.copy(low).lerp(top, (p.getY(i) / 10 + 1) / 2); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  const box = (w, h, pos, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.copy(pos); m.lookAt(0, 0, 0); scene.add(m); };
  box(6, 4, V(-5, 5, 4), 2.4); box(3, 6, V(6, 1, 3), 1.6); box(8, 1.2, V(0, -3, 6), 0.9); box(2, 2, V(2, 6, -4), 1.4);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.03).texture;
  pm.dispose();
  envCache = { renderer, tex };
  return tex;
}

/* ---------------- materials ---------------- */
function materials(env, pal) {
  const metal = new THREE.MeshStandardMaterial({ color: pal.metal, metalness: 1, roughness: 0.22, envMap: env, envMapIntensity: 1.25 });
  const glass = (color, facet = true) => new THREE.MeshPhysicalMaterial({
    color, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.93, envMap: env, envMapIntensity: 1.0,
    clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, flatShading: facet, emissive: new THREE.Color(color).multiplyScalar(0.28)
  });
  const pearl = () => new THREE.MeshPhysicalMaterial({ color: '#F4EEE6', roughness: 0.26, clearcoat: 0.9, clearcoatRoughness: 0.12, iridescence: 0.8, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420], sheen: 0.5, sheenColor: new THREE.Color('#FFE6EE'), envMap: env, envMapIntensity: 1.1 });
  const stone = color => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, envMap: env, envMapIntensity: 0.9 });
  const moon = color => new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, transparent: true, opacity: 0.92, iridescence: 1, iridescenceIOR: 1.25, iridescenceThicknessRange: [300, 600], sheen: 0.7, sheenColor: new THREE.Color('#BFD6FF'), clearcoat: 1, envMap: env, envMapIntensity: 1.2 });
  const frost = color => new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, transparent: true, opacity: 0.86, clearcoat: 0.4, clearcoatRoughness: 0.4, envMap: env, envMapIntensity: 0.9 });
  const silk = new THREE.MeshPhysicalMaterial({ color: pal.silk, roughness: 0.62, sheen: 1, sheenRoughness: 0.32, sheenColor: new THREE.Color(mixHex(pal.silk, '#FFFFFF', 0.55)), envMap: env, envMapIntensity: 0.6 });
  const cord = new THREE.MeshPhysicalMaterial({ color: pal.cord, roughness: 0.5, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color(mixHex(pal.cord, '#FFFFFF', 0.5)), envMap: env, envMapIntensity: 0.4 });
  const thread = new THREE.MeshStandardMaterial({ color: pal.dark ? '#E8CF8E' : '#D2AE62', metalness: 0.6, roughness: 0.35, envMap: env, envMapIntensity: 0.9 });
  const textured = (map, o = {}) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12, envMap: env, envMapIntensity: 0.9, ...o });
  const special = {
    opal: b => new THREE.MeshPhysicalMaterial({ color: b.color, roughness: 0.2, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 900], sheen: 0.8, sheenColor: new THREE.Color('#FFD6F0'), envMap: env, envMapIntensity: 1.1 }),
    labra: b => new THREE.MeshPhysicalMaterial({ color: b.color, roughness: 0.22, clearcoat: 1, iridescence: 1, iridescenceIOR: 2.0, iridescenceThicknessRange: [350, 520], envMap: env, envMapIntensity: 1.3 }),
    amber: b => new THREE.MeshPhysicalMaterial({ color: b.color, roughness: 0.12, transparent: true, opacity: 0.88, clearcoat: 1, emissive: new THREE.Color('#9A4A08'), emissiveIntensity: 0.35, envMap: env, envMapIntensity: 1.1 }),
    onyx: b => new THREE.MeshPhysicalMaterial({ color: b.color, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02, envMap: env, envMapIntensity: 1.6 }),
    shell: b => new THREE.MeshPhysicalMaterial({ color: b.color, roughness: 0.3, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 700], sheen: 0.6, sheenColor: new THREE.Color('#D8F0FF'), envMap: env, envMapIntensity: 1 }),
    banded: b => textured(bandTex(b.bands), b.shape === 'facet' ? { transparent: true, opacity: 0.9, flatShading: true, roughness: 0.08, envMapIntensity: 1.2 } : { sheen: 0.6, sheenColor: new THREE.Color(b.bands[2]) }),
    glitter: b => textured(glitterTex(b.color), { roughness: 0.32 }),
    veined: b => textured(veinTex(b.color), { roughness: 0.42, clearcoat: 0.5 })
  };
  const beadMat = b => special[b.mat] ? special[b.mat](b) : b.mat === 'pearl' ? pearl() : b.mat === 'glass' ? glass(b.color) : b.mat === 'moon' ? moon(b.color) : b.mat === 'frost' ? frost(b.color) : stone(b.color);
  return { metal, glass, pearl, stone, frost, silk, cord, thread, beadMat };
}

/* ---------------- small geometry helpers ---------------- */
const ring = (R, r, mat, rotY = 0) => { const m = new THREE.Mesh(new THREE.TorusGeometry(R, r, 10, 36), mat); m.rotation.y = rotY; return m; };
function extrude(shapes, depth, bevel = 0.012) {
  const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 4, curveSegments: 28 });
  g.center();
  return g;
}
function starShape(R, r, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) { const a = Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r : R; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  return s;
}
function crescentShape(R) {
  const s = new THREE.Shape();
  s.absarc(0, 0, R, Math.PI * 0.5, Math.PI * 1.5, false);
  s.absarc(R * 0.4, 0, R * 0.82, Math.PI * 1.5, Math.PI * 0.5, true);
  return s;
}
function heartShape(k) {
  const s = new THREE.Shape(), x = 0, y = 0;
  s.moveTo(x, y + 0.5 * k);
  s.bezierCurveTo(x, y + 0.5 * k, x - 0.1 * k, y + 1 * k, x - 0.55 * k, y + 1 * k);
  s.bezierCurveTo(x - 1.2 * k, y + 1 * k, x - 1.2 * k, y + 0.3 * k, x - 1.2 * k, y + 0.3 * k);
  s.bezierCurveTo(x - 1.2 * k, y - 0.1 * k, x - 0.8 * k, y - 0.55 * k, x, y - 0.95 * k);
  s.bezierCurveTo(x + 0.8 * k, y - 0.55 * k, x + 1.2 * k, y - 0.1 * k, x + 1.2 * k, y + 0.3 * k);
  s.bezierCurveTo(x + 1.2 * k, y + 0.3 * k, x + 1.2 * k, y + 1 * k, x + 0.55 * k, y + 1 * k);
  s.bezierCurveTo(x + 0.1 * k, y + 1 * k, x, y + 0.5 * k, x, y + 0.5 * k);
  return s;
}
function leafShape(L, W) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.quadraticCurveTo(W, -L * 0.45, 0, -L); s.quadraticCurveTo(-W, -L * 0.45, 0, 0);
  return s;
}
function circleShape(x, y, r) { const s = new THREE.Shape(); s.absarc(x, y, r, 0, Math.PI * 2, false); return s; }
function ellipseShape(rx, ry) { const s = new THREE.Shape(); s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0); return s; }

/* ---------------- beads ---------------- */
function beadGeometry(b) {
  if (b.shape === 'facet') {
    // a faceted rondelle: wide at the waist, flat top and bottom, few facets
    const pts = [V(0.001, -0.074, 0), V(0.062, -0.07, 0), V(0.115, -0.024, 0), V(0.115, 0.024, 0), V(0.062, 0.07, 0), V(0.001, 0.074, 0)].map(v => new THREE.Vector2(v.x, v.y));
    const g = new THREE.LatheGeometry(pts, 10);
    return g.toNonIndexed();
  }
  if (b.shape === 'bicone') return new THREE.LatheGeometry([V(0.001, -0.09, 0), V(0.1, 0, 0), V(0.001, 0.09, 0)].map(v => new THREE.Vector2(v.x, v.y)), 12).toNonIndexed();
  if (b.shape === 'herkimer') { // a double-terminated hexagonal crystal
    const g = new THREE.LatheGeometry([V(0.001, -0.12, 0), V(0.07, -0.06, 0), V(0.07, 0.06, 0), V(0.001, 0.12, 0)].map(v => new THREE.Vector2(v.x, v.y)), 6).toNonIndexed();
    return g;
  }
  if (b.shape === 'disc') { const g = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 40, 1); g.rotateX(Math.PI / 2); return g; }
  if (b.shape === 'baroque') { // a pearl that grew unevenly
    const g = new THREE.SphereGeometry(0.095, 40, 30), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.12 * Math.sin(v.x * 40 + 1) * Math.sin(v.y * 33) + 0.08 * Math.sin(v.z * 51 + v.y * 20); v.multiplyScalar(k); p.setXYZ(i, v.x, v.y * 1.15, v.z); }
    g.computeVertexNormals(); return g;
  }
  if (b.shape === 'pearl') { const g = new THREE.SphereGeometry(0.092, 32, 24); g.scale(1, 0.95, 1); return g; }
  return new THREE.SphereGeometry(0.098, 32, 24);
}
const beadHeight = b => ({ facet: 0.148, pearl: 0.175, bicone: 0.18, herkimer: 0.24, disc: 0.2, baroque: 0.22 })[b.shape] || 0.196;

/* ---------------- small procedural stone textures ---------------- */
function canvasTex(draw) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function bandTex(cols) { // agate-like bands (tiger's eye, malachite, fluorite)
  return canvasTex((g, w, h) => {
    for (let y = 0; y < h; y++) {
      const k = (Math.sin(y * 0.22) + Math.sin(y * 0.071 + 1.3) * 0.8 + 2) / 4;
      g.fillStyle = cols[Math.floor(k * cols.length * 0.999)]; g.fillRect(0, y, w, 1);
    }
    g.globalAlpha = 0.25; g.fillStyle = '#ffffff';
    for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
  });
}
function glitterTex(color) { // aventurine, sunstone, lapis: tiny bright flecks
  return canvasTex((g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 420; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,240,200,.9)' : 'rgba(255,255,255,.6)'; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
  });
}
function veinTex(color) { // turquoise matrix
  return canvasTex((g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.strokeStyle = 'rgba(70,52,40,.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  });
}

/* ---------------- charms (hang from y = 0, downwards) ---------------- */
function buildCharm(id, opt, M, tickers) {
  const g = new THREE.Group();
  const jr = ring(0.026, 0.006, M.metal, Math.PI / 2); g.add(jr);
  const hang = (mesh, top) => { mesh.position.y = -top; g.add(mesh); return mesh; };
  const metalOr = () => opt.mat === 'metal' ? M.metal : opt.mat === 'frost' ? M.frost(opt.color) : M.glass(opt.color, false);
  switch (id) {
    case 'moon': { const m = new THREE.Mesh(extrude(crescentShape(0.1), 0.018), M.metal); m.rotation.z = -0.35; hang(m, 0.125); break; }
    case 'star': { const m = new THREE.Mesh(extrude(starShape(0.105, 0.048), 0.02, 0.014), M.metal); hang(m, 0.125); break; }
    case 'heart': { const m = new THREE.Mesh(extrude(heartShape(0.085), 0.024, 0.018), M.metal); m.rotation.z = Math.PI; hang(m, 0.11); break; }
    case 'key': {
      const bow = circleShape(0, 0, 0.045); bow.holes.push(circleShape(0, 0, 0.024));
      const shaft = new THREE.Shape(); shaft.moveTo(-0.01, -0.04); shaft.lineTo(0.01, -0.04); shaft.lineTo(0.01, -0.2); shaft.lineTo(-0.01, -0.2); shaft.closePath();
      const t1 = new THREE.Shape(); t1.moveTo(0.008, -0.16); t1.lineTo(0.045, -0.16); t1.lineTo(0.045, -0.175); t1.lineTo(0.008, -0.175); t1.closePath();
      const t2 = new THREE.Shape(); t2.moveTo(0.008, -0.185); t2.lineTo(0.035, -0.185); t2.lineTo(0.035, -0.2); t2.lineTo(0.008, -0.2); t2.closePath();
      const geo = new THREE.ExtrudeGeometry([bow, shaft, t1, t2], { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 3, curveSegments: 24 });
      geo.translate(0, 0, -0.007);
      const m = new THREE.Mesh(geo, M.metal); hang(m, 0.072); break;
    }
    case 'bell': {
      const prof = [[0.0, 0.0], [0.03, 0.005], [0.07, 0.02], [0.074, 0.03], [0.062, 0.06], [0.05, 0.1], [0.032, 0.125], [0.0, 0.13]].map(([x, y]) => new THREE.Vector2(x, y));
      const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), M.metal);
      const holder = new THREE.Group(); holder.add(bell); bell.position.y = -0.155;
      const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), M.metal); clapper.position.y = -0.16; holder.add(clapper);
      holder.add(at(ring(0.018, 0.005, M.metal), 0, -0.03, 0));
      g.add(holder);
      tickers.push(t => { clapper.position.x = Math.sin(t * 2.6) * 0.012; });
      break;
    }
    case 'butterfly': {
      const wingMat = M.glass(opt.color, false);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.11, 6, 12), M.metal); body.position.y = -0.13; g.add(body);
      const wings = [];
      for (const sx of [-1, 1]) {
        const w = new THREE.Group(); w.position.y = -0.12;
        const up = new THREE.Mesh(extrude(ellipseShape(0.06, 0.042), 0.006, 0.006), wingMat); up.position.set(sx * 0.055, 0.03, 0); up.rotation.z = sx * 0.5;
        const lo = new THREE.Mesh(extrude(ellipseShape(0.04, 0.03), 0.006, 0.006), wingMat); lo.position.set(sx * 0.042, -0.04, 0); lo.rotation.z = -sx * 0.6;
        w.add(up, lo); g.add(w); wings.push([w, sx]);
      }
      tickers.push(t => wings.forEach(([w, sx]) => { w.rotation.y = sx * (0.25 + Math.sin(t * 2.2) * 0.18); }));
      break;
    }
    case 'flower': {
      const mat = metalOr();
      for (let i = 0; i < 5; i++) {
        const pet = new THREE.Mesh(extrude(ellipseShape(0.032, 0.052), 0.012, 0.01), mat);
        const a = i / 5 * Math.PI * 2;
        pet.position.set(Math.sin(a) * 0.045, -0.12 + Math.cos(a) * 0.045, 0); pet.rotation.z = -a;
        g.add(pet);
      }
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), M.metal); c.position.set(0, -0.12, 0.014); g.add(c);
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), M.metal), 0, -0.04, 0));
      break;
    }
    case 'leaf': {
      const m = new THREE.Mesh(extrude(leafShape(0.2, 0.08), 0.012, 0.01), metalOr()); m.position.y = -0.135; g.add(m);
      const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.17, 6), M.metal); vein.position.set(0, -0.13, 0.014); g.add(vein);
      break;
    }
    case 'cherry': {
      const red = metalOr();
      const joint = V(0, -0.03, 0);
      for (const [x, y] of [[-0.05, -0.17], [0.045, -0.15]]) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.042, 28, 20), red); ball.position.set(x, y, 0); g.add(ball);
        const stem = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(joint, V(x * 0.3, -0.05, 0.01), V(x, y + 0.035, 0)), 16, 0.0045, 6), new THREE.MeshStandardMaterial({ color: '#5E7B3E', roughness: 0.6 }));
        g.add(stem);
      }
      const lf = new THREE.Mesh(extrude(leafShape(0.07, 0.03), 0.004, 0.004), M.glass('#8FC27C', false)); lf.position.set(0.035, -0.05, 0); lf.rotation.z = -1.1; g.add(lf);
      break;
    }
  }
  return g;
}

/* ---------------- motifs (stitched on the pouch front) ---------------- */
function motifGeometry(id) {
  switch (id) {
    case 'crescent': { const s = crescentShape(0.068); return extrude(s, 0.004, 0.003); }
    case 'star': return extrude(starShape(0.07, 0.03), 0.004, 0.003);
    case 'blossom': return extrude([0, 1, 2, 3, 4].map(i => { const a = i / 5 * Math.PI * 2 + Math.PI / 2; return circleShape(Math.cos(a) * 0.036, Math.sin(a) * 0.036, 0.03); }), 0.004, 0.003);
    case 'wave': {
      const shapes = [];
      for (const dy of [0.025, -0.025]) {
        const s = new THREE.Shape(), top = [], n = 40;
        for (let i = 0; i <= n; i++) { const x = -0.09 + (i / n) * 0.18; top.push([x, dy + 0.016 * Math.sin(x * 52)]); }
        s.moveTo(top[0][0], top[0][1]); top.forEach(([x, y]) => s.lineTo(x, y));
        for (let i = n; i >= 0; i--) s.lineTo(top[i][0], top[i][1] - 0.014);
        s.closePath(); shapes.push(s);
      }
      return extrude(shapes, 0.004, 0.003);
    }
    case 'crane': {
      const s = new THREE.Shape();
      const pts = [[-0.1, 0.035], [-0.03, 0.01], [-0.005, 0.07], [0.02, 0.012], [0.085, 0.004], [0.11, 0.022], [0.1, -0.004], [0.03, -0.02], [-0.005, -0.06], [-0.02, -0.02], [-0.085, 0.0]];
      s.moveTo(...pts[0]); pts.slice(1).forEach(p => s.lineTo(...p)); s.closePath();
      return extrude(s, 0.004, 0.003);
    }
  }
  return null;
}

/* ---------------- build ---------------- */
export function build(spec, seed, { renderer } = {}) {
  const rand = rngFor(seed, 'talisman');
  const pal = spec.palette, P = spec.picks;
  const env = studio(renderer);
  const M = materials(env, pal);
  const world = new THREE.Group(), skyLayer = new THREE.Group();
  const parts = {}, tickers = [];
  const reg = (slot, obj) => { (parts[slot] ||= []).push(obj); return obj; };

  // Lights for silk and stones (metal and glass mostly read the environment).
  const hemi = new THREE.HemisphereLight('#FFFFFF', pal.dark ? '#3A3F6A' : '#CFC4BE', pal.dark ? 0.95 : 1.0);
  const key = new THREE.DirectionalLight('#FFFFFF', pal.dark ? 1.4 : 1.5); key.position.set(-2.5, 3, 4);
  const rim = new THREE.DirectionalLight(pal.dark ? '#B7C3FF' : '#FFF1E2', 1.0); rim.position.set(3, 1, -2);
  skyLayer.add(new THREE.Group().add(hemi, key, rim));

  // The whole charm swings from its top ring.
  const TOP = 1.42;
  const swing = new THREE.Group(); swing.position.y = TOP; world.add(swing);
  const body = new THREE.Group(); body.position.y = -TOP; swing.add(body);
  // Motion: every hanging part is a damped spring. Idle, a faint breeze; touched or dragged, it swings and settles.
  const spring = (k, c) => ({ a: 0, v: 0, k, c });
  const S = { main: spring(9, 0.8), tilt: spring(10, 1.2), pouch: spring(12, 1.0), charm: spring(14, 0.9), spin: spring(3, 0.7),
    // twisting on the hook: the clasp follows your finger with a little lag, the pouch and charm trail behind it
    yaw: spring(26, 7.5), pouchTwist: spring(16, 2.6), charmTwist: spring(12, 1.8) };
  const hold = { on: false, target: 0, idle: 0 };
  const YAW_SOFT = 1.25, YAW_MAX = 2.1; // past ~70° the cord resists; it never spins round like a carousel
  const step = (sp, dt, target = 0, lim = 0.7) => { const n = Math.ceil(dt / 0.008), h = dt / n; for (let i = 0; i < n; i++) { sp.v += (-sp.k * (sp.a - target) - sp.c * sp.v) * h; sp.a += sp.v * h; } sp.a = Math.max(-lim, Math.min(lim, sp.a)); };
  const spins = [];

  /* clasp and findings: the metal half */
  const findings = new THREE.Group(); body.add(findings); reg('metal', findings);
  findings.add(at(ring(0.088, 0.017, M.metal), 0, TOP, 0));
  findings.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.07, 16), M.metal), 0, TOP - 0.115, 0));
  const claspProf = [[0.001, 0], [0.04, 0.012], [0.078, 0.07], [0.088, 0.15], [0.078, 0.23], [0.052, 0.29], [0.022, 0.32], [0.001, 0.325]].map(([x, y]) => new THREE.Vector2(x, y));
  const clasp = new THREE.Mesh(new THREE.LatheGeometry(claspProf, 40), M.metal); clasp.scale.set(1, 1, 0.55); clasp.position.y = TOP - 0.47; findings.add(clasp);
  const gate = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 8), M.metal); gate.position.set(0.07, TOP - 0.33, 0.012); gate.rotation.z = -0.18; findings.add(gate);
  findings.add(at(ring(0.045, 0.011, M.metal, Math.PI / 2), 0, TOP - 0.5, 0));

  // the strand
  let y = TOP - 0.56;
  const pinTop = y;
  const beadDirs = [];
  spec.strand.forEach((b, i) => {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.016, 20), M.metal); sp.position.y = y - 0.008; findings.add(sp);
    y -= 0.018;
    const h = beadHeight(b);
    const bead = new THREE.Mesh(beadGeometry(b), M.beadMat(b));
    bead.position.y = y - h / 2; bead.rotation.y = rand() * Math.PI;
    bead.userData.pick = 'bead' + b.pos;
    body.add(bead); reg('bead' + b.pos, bead); spins.push({ mesh: bead, v: 0 });
    beadDirs.push(bead.position.clone());
    y -= h + 0.004;
  });
  const sp2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 20), M.metal); sp2.position.y = y - 0.007; findings.add(sp2);
  y -= 0.02;
  findings.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, pinTop - y, 8), M.metal), 0, (pinTop + y) / 2, 0));
  const eye = ring(0.03, 0.008, M.metal, Math.PI / 2); eye.position.y = y - 0.025; findings.add(eye);
  const RING_Y = y - 0.085;
  findings.add(at(ring(0.06, 0.012, M.metal), 0, RING_Y, 0));

  /* the pouch (silk half): body, stitched border, motif, cord and knot */
  const W = 0.36, H = 0.5, C = 0.075, RR = 0.045, D = 0.032;
  const s = new THREE.Shape();
  s.moveTo(-W / 2 + C, 0); s.lineTo(W / 2 - C, 0); s.lineTo(W / 2, -C); s.lineTo(W / 2, -H + RR);
  s.quadraticCurveTo(W / 2, -H, W / 2 - RR, -H); s.lineTo(-W / 2 + RR, -H); s.quadraticCurveTo(-W / 2, -H, -W / 2, -H + RR);
  s.lineTo(-W / 2, -C); s.closePath();
  const pouchGeo = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 6, curveSegments: 16 });
  pouchGeo.translate(0, 0, -D / 2);
  const pouch = new THREE.Group();
  const POUCH_TOP = RING_Y - 0.16;
  pouch.position.set(-0.02, POUCH_TOP, 0);
  const pouchSwing = new THREE.Group(); pouchSwing.position.set(0, RING_Y, 0); body.add(pouchSwing);
  pouch.position.y = POUCH_TOP - RING_Y; pouchSwing.add(pouch);
  const pouchMesh = new THREE.Mesh(pouchGeo, M.silk); pouchMesh.userData.pick = 'silk'; pouch.add(pouchMesh); reg('silk', pouchMesh);
  // stitches: a dashed line just inside the edge, on the front
  const inset = s.getPoints(10).map(p => V(p.x * 0.82, p.y * 0.9 - H * 0.04, D / 2 + 0.041));
  inset.push(inset[0].clone());
  const stitchGeo = new THREE.BufferGeometry().setFromPoints(inset);
  const stitches = new THREE.Line(stitchGeo, new THREE.LineDashedMaterial({ color: pal.dark ? '#E8CF8E' : '#C9A257', dashSize: 0.014, gapSize: 0.01 }));
  stitches.computeLineDistances(); pouch.add(stitches); reg('silk', stitches);
  const mg = motifGeometry(P.motif.id);
  if (mg) { const motif = new THREE.Mesh(mg, M.thread); motif.userData.pick = 'motif'; motif.position.set(0, -H * 0.56, D / 2 + 0.042); pouch.add(motif); reg('motif', motif); }
  else reg('motif', pouch.add(new THREE.Group()) && pouch.children[pouch.children.length - 1]); // plain silk: nothing stitched, but the slot still has a place
  // cord: a loop from the ring down to a decorative knot at the top of the pouch
  const cordG = new THREE.Group(); cordG.userData.pick = 'cord'; pouch.add(cordG); reg('cord', cordG);
  const loopTop = RING_Y - POUCH_TOP + 0.02;
  const cordCurve = new THREE.CatmullRomCurve3([V(-0.03, 0.02, 0.01), V(-0.035, loopTop * 0.55, 0.005), V(0.02, loopTop, 0), V(0.075, loopTop * 0.55, 0.005), V(0.06, 0.02, 0.01)]);
  cordG.add(new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 48, 0.008, 8), M.cord));
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.026, 0.0085, 80, 8, 2, 3), M.cord); knot.position.set(0.015, 0.02, 0.03); knot.scale.set(1, 0.8, 0.6); cordG.add(knot);
  for (const sx of [-1, 1]) { const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0.015, 0.0, 0.04), V(0.015 + sx * 0.03, -0.05, 0.05), V(0.015 + sx * 0.045, -0.11, 0.05)), 16, 0.006, 6), M.cord); cordG.add(tail); }

  /* the charm (metal half), on a short chain beside the pouch */
  // hangs from its own ring on the right of the bottom ring, in front of the pouch's shoulder
  const charmSwing = new THREE.Group(); charmSwing.position.set(0.055, RING_Y - 0.03, 0.07); body.add(charmSwing);
  const link = ring(0.03, 0.007, M.metal, Math.PI / 2); link.position.set(0.0, -0.01, 0); charmSwing.add(link); reg('metal', link);
  const charm = buildCharm(P.charm.id, P.charm, M, tickers); charm.scale.setScalar(1.45); charm.position.set(0, -0.03, 0); charmSwing.add(charm); reg('charm', charm); charm.userData.pick = 'charm';
  charmSwing.rotation.z = 0.42;
  findings.userData.pick = 'metal';
  tickers.push((t, dt) => {
    const breeze = Math.sin(t * 0.7) * 0.022 + Math.sin(t * 1.93 + 1) * 0.008;
    // let go: the cord slowly unwinds back towards the front; left alone, it turns just a little in the air
    if (!hold.on) { hold.idle += dt; hold.target *= Math.exp(-0.9 * dt); }
    const idleTurn = hold.idle > 2.5 ? Math.sin((hold.idle - 2.5) * 0.32) * 0.32 * Math.min(1, (hold.idle - 2.5) / 3) : 0;
    const yawVel0 = S.yaw.v;
    step(S.yaw, dt, hold.target + idleTurn, YAW_MAX);
    const yawAcc = (S.yaw.v - yawVel0) / Math.max(dt, 1e-3);
    step(S.main, dt, breeze, 0.5); step(S.tilt, dt, Math.sin(t * 0.6 + 2) * 0.01 - Math.min(0.05, Math.abs(S.yaw.v) * 0.01));
    step(S.pouch, dt, -S.main.a * 0.45); step(S.charm, dt, -S.main.a * 0.6); step(S.spin, dt);
    // lower parts lag behind a turn and swing a little past it when it stops
    step(S.pouchTwist, dt, -S.yaw.v * 0.16 - yawAcc * 0.004, 0.9);
    step(S.charmTwist, dt, -S.yaw.v * 0.24 - yawAcc * 0.006, 1.2);
    swing.rotation.set(S.tilt.a, S.yaw.a, S.main.a, 'YXZ');
    pouchSwing.rotation.set(0, S.pouchTwist.a, S.pouch.a, 'YXZ');
    charmSwing.rotation.z = 0.42 + S.charm.a;
    charm.rotation.y = S.spin.a * 2.2 + S.charmTwist.a + Math.sin(t * 0.8) * 0.3;
    for (const b of spins) { b.v *= Math.exp(-1.1 * dt); b.mesh.rotation.y += b.v * dt; }
  });

  // A sparkle sprite on beads both of you chose (an echo).
  for (const b of spec.strand.filter(b => spec.echoBeads.includes(b.id))) {
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex(), color: '#FFFFFF', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glint.position.copy(beadDirs[b.pos - 1]).add(V(0.07, 0.05, 0.08)); glint.scale.setScalar(0.09);
    body.add(glint); reg('bead' + b.pos, glint);
    tickers.push(t => { glint.material.opacity = 0.5 + 0.5 * Math.sin(t * 2 + b.pos); glint.material.rotation = t * 0.4; });
  }

  // Ghosts: before the reveal, every part waits as a faint outline of itself.
  const ghostMat = new THREE.MeshBasicMaterial({ color: pal.dark ? '#8C90B8' : '#B9B0C2', transparent: true, opacity: 0.22, depthWrite: false });
  const ghosts = {};
  function ghostOf(slot) {
    if (ghosts[slot]) return ghosts[slot];
    const list = [];
    world.updateWorldMatrix(true, true);
    for (const root of parts[slot] || []) {
      const parent = root.parent;
      if (!parent) continue;
      const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
      root.traverse(o => {
        if (!o.isMesh) return;
        const g = new THREE.Mesh(o.geometry, ghostMat);
        g.matrixAutoUpdate = false;
        g.matrix.multiplyMatrices(inv, o.matrixWorld);
        list.push({ g, parent });
      });
    }
    return (ghosts[slot] = list);
  }

  let time = 0;
  const frame = { dist: 5.8, objectDist: 4.4, camY: 0.4, lookY: 0.12, fitAspect: false, turn: 'hang', ornament: 'sparkles' };
  const kick = (sp, x) => { sp.v += x; };
  return {
    world, skyLayer, parts, frame,
    spots: { front: V(0, 0, 1) },
    update(dt) {
      time += dt;
      for (const f of tickers) f(time, dt);
    },
    prepareReveal() {
      for (const slot of Object.keys(parts)) {
        for (const { g, parent } of ghostOf(slot)) { g.visible = true; parent.add(g); }
        parts[slot].forEach(o => { o.visible = false; });
      }
    },
    reveal(slot, tween) {
      const objs = parts[slot]; if (!objs) return false;
      for (const { g } of ghosts[slot] || []) g.visible = false;
      objs.forEach((o, k) => {
        const target = o.scale.clone();
        o.scale.copy(target).multiplyScalar(0.001); o.visible = true;
        tween(0.75, e => o.scale.copy(target).multiplyScalar(0.001 + 0.999 * e), k2 => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(k2 - 1, 3) + c1 * Math.pow(k2 - 1, 2); }, k * 0.06);
      });
      return true;
    },
    /** A touch on a part: a bead spins on its pin, the pouch or charm swings, the whole strand sways. */
    touch(pick, strength = 1, dir = 0) {
      const d = (dir || (Math.random() < 0.5 ? -1 : 1)) * Math.min(2, strength);
      if (pick?.startsWith('bead')) { const b = spins[+pick.slice(4) - 1]; if (b) b.v += 9 * d; kick(S.main, 0.45 * d); }
      else if (pick === 'silk' || pick === 'motif' || pick === 'cord') { kick(S.pouch, 2.0 * d); kick(S.main, 0.2 * d); }
      else if (pick === 'charm') { kick(S.charm, 2.6 * d); kick(S.spin, 3.5 * d); }
      else kick(S.main, 0.8 * d);
    },
    /** Dragging twists the charm on its hook (softly limited) and moves the clasp; everything below lags behind and swings. */
    drag(dx, dy = 0) {
      hold.on = true; hold.idle = 0;
      const over = Math.abs(hold.target) > YAW_SOFT && Math.sign(dx) === Math.sign(hold.target);
      hold.target = Math.max(-YAW_MAX, Math.min(YAW_MAX, hold.target + dx * (over ? 0.25 : 1)));
      kick(S.main, -dx * 1.1); kick(S.pouch, -dx * 1.9); kick(S.charm, -dx * 2.6);
      if (dy) kick(S.tilt, dy * 1.2);
    },
    release() { hold.on = false; },
    revealAll() { for (const objs of Object.values(parts)) objs.forEach(o => { o.visible = true; }); for (const list of Object.values(ghosts)) list.forEach(({ g }) => { g.visible = false; }); },
    dispose() { [world, skyLayer].forEach(g => g.traverse(o => o.geometry?.dispose?.())); }
  };
}

let sparkle = null;
function sparkleTex() {
  if (sparkle) return sparkle;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.translate(32, 32); g.fillStyle = '#fff';
  g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 5 : 30; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
  sparkle = new THREE.CanvasTexture(c); sparkle.colorSpace = THREE.SRGBColorSpace;
  return sparkle;
}
