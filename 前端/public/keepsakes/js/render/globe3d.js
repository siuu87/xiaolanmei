// Memory Snow Globe renderer. Deterministic: (spec, seed) -> the same globe every time.
// Inside the glass: an illustrated diorama (toon + ink, like the planet). The glass and the base are physical.
// The particles are simulated: they fall, settle on the ground, and swirl up when the globe is shaken.
import { THREE, toon, glow, mesh, group, outline, mixHex, shade, shadows, shadowKey, halo } from './kit.js';
import { rngFor } from '../engine/codec.js';
export { THREE };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const ink = 0.06;

/* ---------------- studio environment (shared idea with the talisman) ---------------- */
let envCache = null;
function studio(renderer) {
  if (!renderer) return null;
  if (envCache?.renderer === renderer) return envCache.tex;
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16), cols = [], p = geo.attributes.position, c = new THREE.Color(), top = new THREE.Color('#FFFFFF'), low = new THREE.Color('#8C8496');
  for (let i = 0; i < p.count; i++) { c.copy(low).lerp(top, (p.getY(i) / 10 + 1) / 2); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  const box = (w, h, pos, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.copy(pos); m.lookAt(0, 0, 0); scene.add(m); };
  box(2.2, 5, V(-5, 3, 4), 3.4); box(1.2, 4, V(5, 2, 3), 2.2); box(6, 0.8, V(0, 6, 1), 1.5);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.02).texture; pm.dispose();
  envCache = { renderer, tex };
  return tex;
}

/* ---------------- procedural textures ---------------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const rnd = seed => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
function woodTex(color) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    const r = rnd(11);
    for (let i = 0; i < 90; i++) {
      const x = r() * w; g.strokeStyle = `rgba(40,20,10,${0.06 + r() * 0.12})`; g.lineWidth = 0.6 + r() * 2;
      g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 8) g.lineTo(x + Math.sin(y * 0.05 + i) * 3, y); g.stroke();
    }
  });
}
function marbleTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#F2EFEA'; g.fillRect(0, 0, w, h);
    const r = rnd(5);
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = `rgba(120,115,125,${0.18 + r() * 0.25})`; g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath(); let x = r() * w, y = 0; g.moveTo(x, y);
      while (y < h) { x += (r() - 0.5) * 40; y += 10 + r() * 20; g.lineTo(x, y); }
      g.stroke();
    }
  });
}
function spriteTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.translate(32, 32); g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  if (kind === 'flake') { const r = g.createRadialGradient(0, 0, 0, 0, 0, 26); r.addColorStop(0, '#fff'); r.addColorStop(0.5, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill(); }
  else if (kind === 'petal') { g.beginPath(); g.ellipse(0, 0, 12, 24, 0.6, 0, 7); g.fill(); }
  else if (kind === 'drop') { const r = g.createLinearGradient(0, -28, 0, 28); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,.95)'); g.fillStyle = r; g.fillRect(-2.5, -28, 5, 56); }
  else if (kind === 'star') { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? 7 : 30; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); }
  else if (kind === 'square') { g.fillRect(-15, -10, 30, 20); }
  else if (kind === 'seed') { g.lineWidth = 1.6; g.lineCap = 'round'; for (let i = 0; i < 11; i++) { const a = -Math.PI * 0.9 + i / 10 * Math.PI * 0.8; g.beginPath(); g.moveTo(0, 6); g.lineTo(Math.cos(a) * 26, 6 + Math.sin(a) * 26); g.stroke(); } g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, 6); g.lineTo(0, 28); g.stroke(); }
  else if (kind === 'streak') { // a window caught in the glass
    const r = g.createLinearGradient(-20, 0, 20, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.35, 'rgba(255,255,255,.9)'); r.addColorStop(0.65, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.beginPath(); g.ellipse(0, 0, 18, 31, 0, 0, 7); g.fill();
  }
  else if (kind === 'shadow') { const r = g.createRadialGradient(0, 0, 0, 0, 0, 32); r.addColorStop(0, 'rgba(40,30,50,.55)'); r.addColorStop(0.55, 'rgba(40,30,50,.22)'); r.addColorStop(1, 'rgba(40,30,50,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); }
  else if (kind === 'ring') { g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 24, 0, 7); g.stroke(); g.globalAlpha = 0.6; g.beginPath(); g.arc(-8, -9, 6, 0, 7); g.fill(); }
  else { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, '#fff'); r.addColorStop(0.3, '#fff'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------------- glass shapes: profile r(y) of the inside, ground level, top ---------------- */
function glassShape(id) {
  const lathe = (pts, seg = 64) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  const arc = (r, cy, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [Math.cos(a) * r, cy + Math.sin(a) * r]; });
  switch (id) {
    case 'dome': {
      const pts = [[0.78, -0.8], [0.78, 0.22], ...arc(0.78, 0.22, 0, Math.PI / 2).slice(1)];
      return { geo: lathe(pts), ground: -0.68, top: 0.98, r: y => y < 0.22 ? 0.78 : Math.sqrt(Math.max(0, 0.78 ** 2 - (y - 0.22) ** 2)), scale: 1.4, groundR: 0.74 };
    }
    case 'drop': {
      const pts = [[0.58, -0.8], [0.8, -0.45], [0.86, -0.1], [0.78, 0.3], [0.55, 0.7], [0.25, 1.0], [0.08, 1.12], [0.0, 1.14]];
      const R = y => { for (let i = 1; i < pts.length; i++) if (y <= pts[i][1]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return x0 + (x1 - x0) * (y - y0) / (y1 - y0); } return 0; };
      return { geo: lathe(pts), ground: -0.6, top: 1.1, r: R, scale: 1.3, groundR: 0.66 };
    }
    case 'egg': {
      const pts = [[0.55, -0.8], [0.78, -0.55], [0.86, -0.2], [0.84, 0.15], [0.74, 0.5], [0.55, 0.82], [0.3, 1.02], [0.0, 1.1]];
      const R = y => { for (let i = 1; i < pts.length; i++) if (y <= pts[i][1]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return x0 + (x1 - x0) * (y - y0) / (y1 - y0); } return 0; };
      const smooth = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(48);
      smooth[smooth.length - 1].x = 0;
      return { geo: new THREE.LatheGeometry(smooth, 72), ground: -0.6, top: 1.08, r: R, scale: 1.3, groundR: 0.7 };
    }
    case 'facet': {
      const R = 0.95, pts = [...arc(R, 0, -1.0, Math.PI / 2, 9)];
      return { geo: new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 8), center: 0, ground: -0.55, top: R, r: y => Math.sqrt(Math.max(0, R * R - y * y)) * 0.92, scale: 1.45, groundR: 0.68, facet: true };
    }
    case 'orb': {
      const c = 0.2, R = 0.74;
      return { geo: new THREE.SphereGeometry(R, 64, 40), center: c, ground: -0.3, top: c + R, r: y => Math.sqrt(Math.max(0, R * R - (y - c) ** 2)), scale: 1.0, groundR: 0.52, pedestal: true };
    }
    default: {
      const c = 0.0, R = 0.95;
      return { geo: new THREE.SphereGeometry(R, 64, 40), center: c, ground: -0.55, top: c + R, r: y => Math.sqrt(Math.max(0, R * R - (y - c) ** 2)), scale: 1.45, groundR: 0.74 };
    }
  }
}

/* ---------------- places (built around the origin, on y = 0, about 0.55 across) ---------------- */
function buildPlace(id, P, lamps, flags, rand) {
  const g = new THREE.Group(), windows = [];
  const win = (w, h, pos, rotY = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#EAF0F6', toneMapped: false })); m.position.set(...pos); m.rotation.y = rotY; windows.push(m); return m; };
  const roofPrism = (w, h, d, color) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(0, h); s.lineTo(w / 2, 0); s.closePath(); const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); geo.translate(0, 0, -d / 2); return mesh(geo, toon(color), { ink }); };
  const tree = (x, z, color = '#8CC08A', s = 1) => { const t = group(mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.18, 7), toon('#8E6B55'), { pos: [0, 0.09, 0], ink }), mesh(new THREE.IcosahedronGeometry(0.13, 1), toon(color), { pos: [0, 0.27, 0], ink }), mesh(new THREE.IcosahedronGeometry(0.09, 1), toon(mixHex(color, '#FFFFFF', 0.15)), { pos: [0.08, 0.22, 0.03], ink })); t.position.set(x, 0, z); t.scale.setScalar(s); return t; };
  const lamp = (x, z, h = 0.34) => { const l = group(mesh(new THREE.CylinderGeometry(0.008, 0.01, h, 6), toon('#3E3A4A'), { pos: [0, h / 2, 0] })); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), new THREE.MeshBasicMaterial({ color: '#EAF0F6', toneMapped: false })); bulb.position.y = h; windows.push(bulb); l.add(bulb); l.position.set(x, 0, z); return l; };
  const bench = (x, z, rotY = 0) => { const b = new THREE.Group(); const wood = toon('#A9775A'); for (let i = 0; i < 3; i++) b.add(mesh(new THREE.BoxGeometry(0.22, 0.012, 0.025), wood, { pos: [0, 0.07, -0.03 + i * 0.03], ink: 0.15 })); b.add(mesh(new THREE.BoxGeometry(0.22, 0.05, 0.012), wood, { pos: [0, 0.11, -0.06], ink: 0.15 })); for (const sx of [-1, 1]) b.add(mesh(new THREE.BoxGeometry(0.012, 0.07, 0.07), toon('#3E3A4A'), { pos: [sx * 0.1, 0.035, 0] })); b.position.set(x, 0, z); b.rotation.y = rotY; return b; };
  switch (id) {
    case 'cabin': {
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.18, 0.24), toon('#9C6B4E'), { pos: [0, 0.09, -0.05], ink }));
      const roof = roofPrism(0.36, 0.14, 0.3, flags.snowRoof ? '#FFFFFF' : '#7D4B45'); roof.position.set(0, 0.18, -0.05); g.add(roof);
      g.add(mesh(new THREE.BoxGeometry(0.04, 0.09, 0.04), toon('#7A6A66'), { pos: [0.09, 0.27, -0.05], ink }));
      g.add(win(0.06, 0.06, [-0.07, 0.1, 0.071]), win(0.06, 0.06, [0.07, 0.1, 0.071]));
      g.add(mesh(new THREE.PlaneGeometry(0.05, 0.1), toon('#5E3D2E'), { pos: [0, 0.05, 0.071] }));
      for (const [x, z, s] of [[-0.32, -0.12, 1.1], [0.32, -0.15, 1.2], [-0.24, -0.32, 0.9], [0.22, -0.34, 1]]) { const t = group(mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 6), toon('#8E6B55'), { pos: [0, 0.03, 0] }), mesh(new THREE.ConeGeometry(0.07, 0.15, 7), toon('#5E8F6E'), { pos: [0, 0.12, 0], ink }), mesh(new THREE.ConeGeometry(0.05, 0.11, 7), toon(P.weather.id === 'snow' ? '#FFFFFF' : '#6FA07E'), { pos: [0, 0.2, 0], ink })); t.position.set(x, 0, z); t.scale.setScalar(s); g.add(t); }
      break;
    }
    case 'street': {
      const house = (x, w, h, color, roofC) => { const hs = group(mesh(new THREE.BoxGeometry(w, h, 0.2), toon(color), { pos: [0, h / 2, 0], ink })); const r = roofPrism(w + 0.03, 0.08, 0.22, roofC); r.position.y = h; hs.add(r); for (let fy = 0; fy < Math.floor(h / 0.1); fy++) for (const fx of [-w / 4, w / 4]) hs.add(win(0.035, 0.045, [fx, 0.07 + fy * 0.1, 0.101])); hs.position.set(x, 0, -0.12); return hs; };
      g.add(house(-0.13, 0.17, 0.36, '#E7C9B7', '#6E5B70'), house(0.06, 0.15, 0.3, '#C9D5E8', '#7D4B45'), house(0.22, 0.13, 0.4, '#EADCB4', '#4F5E7D'));
      g.add(lamp(-0.3, 0.12));
      break;
    }
    case 'seaside': {
      g.add(mesh(new THREE.BoxGeometry(0.24, 0.16, 0.2), toon('#F4F1EA'), { pos: [-0.08, 0.08, -0.1], ink }));
      const roof = roofPrism(0.3, 0.12, 0.24, '#6F8FC4'); roof.position.set(-0.08, 0.16, -0.1); g.add(roof);
      g.add(win(0.05, 0.05, [-0.13, 0.09, 0.001]), win(0.05, 0.05, [-0.03, 0.09, 0.001]));
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.012, 32, 1, false, -0.4, 2.2), toon('#8CC4E6', { opacity: 0.9 }), { pos: [0.12, 0.006, 0.14] }));
      for (const [x, z, s] of [[0.28, -0.08, 0.05], [0.33, 0.02, 0.035], [-0.3, 0.08, 0.04]]) g.add(mesh(new THREE.IcosahedronGeometry(s, 0), toon('#A9A2AE'), { pos: [x, s * 0.6, z], ink: 0.1 }));
      break;
    }
    case 'platform': {
      g.add(mesh(new THREE.BoxGeometry(0.62, 0.05, 0.22), toon('#BDB5B0'), { pos: [0, 0.025, -0.12], ink }));
      for (const z of [0.08, 0.16]) g.add(mesh(new THREE.BoxGeometry(0.66, 0.012, 0.012), toon('#6E6670'), { pos: [0, 0.006, z] }));
      for (let i = -3; i <= 3; i++) g.add(mesh(new THREE.BoxGeometry(0.02, 0.006, 0.12), toon('#8E6B55'), { pos: [i * 0.09, 0.003, 0.12] }));
      const b = bench(-0.1, -0.15); b.position.y = 0.05; g.add(b);
      const sign = group(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 6), toon('#3E3A4A'), { pos: [0, 0.13, 0] }), mesh(new THREE.BoxGeometry(0.16, 0.05, 0.01), toon('#2F4B7C'), { pos: [0, 0.27, 0], ink: 0.12 }));
      sign.position.set(0.17, 0.05, -0.18); g.add(sign);
      const l = lamp(0.27, -0.12, 0.3); l.position.y = 0.05; g.add(l);
      break;
    }
    case 'bench': {
      g.add(tree(-0.12, -0.18, P.weather.id === 'petals' ? '#F4B6C6' : P.weather.id === 'leaves' ? '#E59A4E' : '#8CC08A', 1.35));
      g.add(bench(0.08, -0.04, -0.2));
      g.add(lamp(0.3, -0.15));
      break;
    }
    case 'rooftop': {
      g.add(mesh(new THREE.BoxGeometry(0.62, 0.06, 0.5), toon('#B7ADAA'), { pos: [0, 0.03, -0.05], ink }));
      for (let i = 0; i < 13; i++) g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 4), toon('#4A4554'), { pos: [-0.3 + i * 0.05, 0.1, -0.29] }));
      g.add(mesh(new THREE.BoxGeometry(0.62, 0.008, 0.008), toon('#4A4554'), { pos: [0, 0.14, -0.29] }));
      const tower = group(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16), toon('#A9775A'), { pos: [0, 0.2, 0], ink }), mesh(new THREE.ConeGeometry(0.08, 0.05, 16), toon('#6E5B70'), { pos: [0, 0.285, 0], ink }));
      for (const [x, z] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]]) tower.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 4), toon('#4A4554'), { pos: [x, 0.07, z] }));
      tower.position.set(0.18, 0.06, -0.14); g.add(tower);
      // string lights: a sagging line of bulbs
      for (let i = 0; i <= 12; i++) { const t = i / 12, x = -0.3 + t * 0.48, y = 0.32 - Math.sin(t * Math.PI) * 0.07; const b = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshBasicMaterial({ color: '#EAF0F6', toneMapped: false })); b.position.set(x, y, -0.2 + t * 0.1); windows.push(b); g.add(b); }
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.26, 4), toon('#4A4554'), { pos: [-0.3, 0.19, -0.2] }));
      break;
    }
    case 'bookshop': {
      g.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 0.2), toon('#2F5B4C'), { pos: [0, 0.15, -0.12], ink }));
      g.add(mesh(new THREE.BoxGeometry(0.44, 0.03, 0.22), toon('#E9DCC4'), { pos: [0, 0.315, -0.12], ink }));
      const awn = new THREE.Group();
      for (let i = 0; i < 8; i++) awn.add(mesh(new THREE.BoxGeometry(0.05, 0.008, 0.1), toon(i % 2 ? '#F2EDE4' : '#C8463B'), { pos: [-0.175 + i * 0.05, 0, 0.05] }));
      awn.position.set(0, 0.24, -0.02); awn.rotation.x = 0.35; g.add(awn);
      g.add(win(0.17, 0.12, [-0.09, 0.11, -0.019]), win(0.06, 0.15, [0.12, 0.075, -0.019]));
      for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.02, 0.05 + (i % 3) * 0.01, 0.03), toon(['#C8463B', '#E6C27A', '#6F8FC4', '#8CC08A', '#B79BE6'][i]), { pos: [-0.16 + i * 0.035, 0.07, -0.01] }));
      break;
    }
    case 'pier': {
      g.add(mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.014, 40), toon('#8CC4E6', { opacity: 0.92 }), { pos: [0, 0.008, 0] }));
      for (let i = 0; i < 10; i++) g.add(mesh(new THREE.BoxGeometry(0.12, 0.012, 0.035), toon(i % 2 ? '#B98D6E' : '#A9775A'), { pos: [-0.12, 0.06, -0.3 + i * 0.04], ink: 0.15 }));
      for (const z of [-0.3, -0.1, 0.06]) for (const x of [-0.17, -0.07]) g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), toon('#7A5A44'), { pos: [x, 0.03, z] }));
      const hull = mesh(new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon('#E9DCC4', { side: THREE.DoubleSide }), { ink: 0.08, scale: [1.6, 0.6, 0.8] });
      const boat = group(hull); boat.position.set(0.16, 0.035, -0.02); boat.rotation.y = 0.5; g.add(boat);
      g.add(lamp(-0.12, 0.08, 0.2));
      break;
    }
    case 'garden': {
      const white = toon('#F4F1EA');
      for (let i = -6; i <= 6; i++) { if (Math.abs(i) < 1) continue; const a = i * 0.16, x = Math.sin(a) * 0.36, z = -Math.cos(a) * 0.36 + 0.05; g.add(mesh(new THREE.BoxGeometry(0.02, 0.1, 0.012), white, { pos: [x, 0.05, z], rot: [0, -a, 0], ink: 0.2 })); }
      const arch = mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 20, Math.PI), white, { pos: [0, 0.16, -0.31], ink: 0.15 });
      g.add(arch, mesh(new THREE.BoxGeometry(0.014, 0.16, 0.014), white, { pos: [-0.09, 0.08, -0.31] }), mesh(new THREE.BoxGeometry(0.014, 0.16, 0.014), white, { pos: [0.09, 0.08, -0.31] }));
      for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.4; const bush = group(mesh(new THREE.IcosahedronGeometry(0.05, 1), toon('#7FB77E'), { ink: 0.1 })); for (let k = 0; k < 4; k++) bush.add(mesh(new THREE.IcosahedronGeometry(0.012, 0), toon(['#F4B6C6', '#FFFFFF', '#F8DE7E', '#C9B6F0'][(i + k) % 4]), { pos: [Math.cos(k * 1.6) * 0.04, 0.03, Math.sin(k * 1.6) * 0.04] })); bush.position.set(Math.sin(a) * 0.26, 0.04, -Math.cos(a) * 0.26 + 0.05); g.add(bush); }
      break;
    }
    case 'cafe': {
      g.add(mesh(new THREE.BoxGeometry(0.44, 0.3, 0.2), toon('#E8DFCC'), { pos: [0, 0.15, -0.14], ink }));
      g.add(mesh(new THREE.BoxGeometry(0.46, 0.03, 0.22), toon('#6F8F7A'), { pos: [0, 0.315, -0.14], ink }));
      g.add(win(0.26, 0.13, [-0.06, 0.12, -0.039]), win(0.06, 0.15, [0.15, 0.075, -0.039]));
      const awn = new THREE.Group();
      for (let i = 0; i < 9; i++) awn.add(mesh(new THREE.BoxGeometry(0.045, 0.008, 0.11), toon(i % 2 ? '#F4F1EA' : '#7FA38C'), { pos: [-0.18 + i * 0.045, 0, 0.055] }));
      awn.position.set(0, 0.235, -0.04); awn.rotation.x = 0.4; g.add(awn);
      const table = group(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 18), toon('#F4F1EA'), { pos: [0, 0.09, 0], ink: 0.12 }), mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6), toon('#3E3A4A'), { pos: [0, 0.045, 0] }),
        mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.022, 10), toon('#FFFFFF'), { pos: [0.02, 0.106, 0.01], ink: 0.15 }));
      table.position.set(-0.08, 0, 0.1); g.add(table);
      for (const sx of [-1, 1]) { const ch = group(mesh(new THREE.BoxGeometry(0.05, 0.008, 0.05), toon('#3E3A4A'), { pos: [0, 0.06, 0] }), mesh(new THREE.BoxGeometry(0.05, 0.06, 0.006), toon('#3E3A4A'), { pos: [0, 0.09, -0.022] })); ch.position.set(-0.08 + sx * 0.1, 0, 0.1); ch.rotation.y = sx * 1.3; g.add(ch); }
      break;
    }
    case 'ferris': {
      const wheel = new THREE.Group(); wheel.position.set(0, 0.36, -0.12);
      wheel.add(mesh(new THREE.TorusGeometry(0.24, 0.008, 6, 48), toon('#F4F1EA'), { ink: 0.2 }), mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 20), toon('#E9909C')));
      const gond = [], cols = ['#E9909C', '#8FA7D9', '#F6DE97', '#9ED29A', '#C6B4F0', '#F2C3A8', '#A9CDF0', '#F4B6C6'];
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        wheel.add(mesh(new THREE.BoxGeometry(0.006, 0.24, 0.006), toon('#F4F1EA'), { pos: [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0], rot: [0, 0, a - Math.PI / 2] }));
        const gd = group(mesh(new THREE.BoxGeometry(0.05, 0.04, 0.04), toon(cols[i]), { pos: [0, -0.03, 0], ink: 0.12 }), mesh(new THREE.ConeGeometry(0.035, 0.02, 4), toon(cols[i]), { pos: [0, 0.0, 0], rot: [0, Math.PI / 4, 0] }));
        gd.position.set(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0.02); wheel.add(gd); gond.push(gd);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), new THREE.MeshBasicMaterial({ color: '#EAF0F6', toneMapped: false })); bulb.position.set(Math.cos(a + 0.4) * 0.24, Math.sin(a + 0.4) * 0.24, 0.012); windows.push(bulb); wheel.add(bulb);
      }
      g.add(wheel);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.4, 6), toon('#B7ADAA'), { pos: [sx * 0.1, 0.18, -0.12 + sz * 0.04], rot: [sz * 0.12, 0, sx * 0.27] }));
      g.add(mesh(new THREE.BoxGeometry(0.34, 0.03, 0.14), toon('#C9B3A2'), { pos: [0, 0.015, -0.12], ink }));
      g.userData.tick = t => { wheel.rotation.z = t * 0.25; gond.forEach(gd => { gd.rotation.z = -t * 0.25; }); };
      break;
    }
    case 'campsite': {
      const tri = new THREE.Shape(); tri.moveTo(-0.13, 0); tri.lineTo(0, 0.17); tri.lineTo(0.13, 0); tri.closePath();
      const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.24, bevelEnabled: false }); tg.translate(0, 0, -0.12);
      const tent = mesh(tg, toon('#E9A07A'), { ink }); tent.position.set(-0.14, 0, -0.16); tent.rotation.y = 0.5; g.add(tent);
      g.add(win(0.05, 0.08, [-0.08, 0.04, -0.06], 0.5));
      const fire = new THREE.Group(); fire.position.set(0.1, 0, 0.06);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; fire.add(mesh(new THREE.IcosahedronGeometry(0.018, 0), toon('#9C9AA6'), { pos: [Math.cos(a) * 0.05, 0.008, Math.sin(a) * 0.05], ink: 0.15 })); }
      for (const r of [0.5, -0.6, 1.6]) fire.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.07, 5), toon('#8E6B55'), { pos: [0, 0.01, 0], rot: [Math.PI / 2, r, 0] }));
      const flame = mesh(new THREE.ConeGeometry(0.022, 0.06, 7), glow('#FFB45C'), { pos: [0, 0.035, 0] }), inner = mesh(new THREE.ConeGeometry(0.011, 0.035, 6), glow('#FFF0B0'), { pos: [0, 0.028, 0] });
      const fh = halo('#FFB45C', 0.26, 0.7); fh.position.y = 0.04; fire.add(flame, inner, fh);
      const fl = new THREE.PointLight('#FFB070', 0.8, 0.9, 2); fl.position.y = 0.06; fire.add(fl);
      g.add(fire);
      for (const [x, z, rr] of [[0.26, -0.02, 0.3], [-0.02, 0.2, -0.2]]) g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), toon('#A9775A'), { pos: [x, 0.022, z], rot: [0, rr, Math.PI / 2], ink: 0.12 }));
      for (const [x, z, sc] of [[0.3, -0.28, 1.1], [0.12, -0.36, 0.9]]) { const t = group(mesh(new THREE.ConeGeometry(0.07, 0.16, 7), toon('#5E8F6E'), { pos: [0, 0.1, 0], ink }), mesh(new THREE.ConeGeometry(0.05, 0.12, 7), toon('#6FA07E'), { pos: [0, 0.18, 0], ink })); t.position.set(x, 0, z); t.scale.setScalar(sc); g.add(t); }
      g.userData.tick = t => { const f = 0.85 + 0.2 * Math.sin(t * 13) * Math.sin(t * 7.3); flame.scale.set(1, f, 1); inner.scale.set(1, 1.1 - (f - 0.85), 1); fh.material.opacity = 0.45 + 0.3 * f - 0.2; fl.intensity = 0.6 + 0.3 * f; };
      break;
    }
    case 'lighthouse': {
      g.add(mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.012, 40), toon('#8CC4E6', { opacity: 0.92 }), { pos: [0, 0.006, 0] }));
      for (const [x, z, r] of [[0, -0.12, 0.13], [0.12, -0.05, 0.09], [-0.13, -0.02, 0.1], [0.05, 0.08, 0.07]]) g.add(mesh(new THREE.IcosahedronGeometry(r, 0), toon('#A9A2AE', { flat: true }), { pos: [x, r * 0.45, z], scale: [1, 0.7, 1], ink: 0.08 }));
      const tw = new THREE.Group(); tw.position.set(0, 0.1, -0.1);
      for (let i = 0; i < 4; i++) tw.add(mesh(new THREE.CylinderGeometry(0.05 - i * 0.006, 0.056 - i * 0.006, 0.07, 16), toon(i % 2 ? '#D9635B' : '#F4F1EA'), { pos: [0, 0.035 + i * 0.07, 0], ink }));
      const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.045, 12), new THREE.MeshBasicMaterial({ color: '#EAF0F6', toneMapped: false })); lampRoom.position.y = 0.3; windows.push(lampRoom); tw.add(lampRoom);
      tw.add(mesh(new THREE.ConeGeometry(0.045, 0.05, 12), toon('#3E3A4A'), { pos: [0, 0.35, 0], ink }));
      if (flags.beam) {
        const beam = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#FFF0B8', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        beam.rotation.z = Math.PI / 2; beam.position.x = 0.25;
        const bp = group(beam); bp.position.y = 0.3; tw.add(bp);
        g.userData.tick = t => { bp.rotation.y = t * 0.8; };
      }
      g.add(tw);
      break;
    }
    case 'window': {
      // a window seat: an arched window at the back, a cushion, curtains, a plant
      g.add(mesh(new THREE.BoxGeometry(0.62, 0.008, 0.5), toon('#C9A784'), { pos: [0, 0.004, -0.04] }));
      const frame = toon('#F4F1EA');
      g.add(mesh(new THREE.BoxGeometry(0.62, 0.5, 0.03), toon('#E8DCCB'), { pos: [0, 0.25, -0.3], ink }));
      const glassPane = win(0.3, 0.3, [0, 0.27, -0.284]); g.add(glassPane);
      g.add(mesh(new THREE.BoxGeometry(0.01, 0.3, 0.012), frame, { pos: [0, 0.27, -0.278] }), mesh(new THREE.BoxGeometry(0.3, 0.01, 0.012), frame, { pos: [0, 0.27, -0.278] }));
      g.add(mesh(new THREE.BoxGeometry(0.4, 0.08, 0.16), toon('#B89AC8'), { pos: [0, 0.04, -0.2], ink }), mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), toon('#F2C6CF'), { pos: [-0.12, 0.11, -0.24], rot: [0.2, 0, 0.1], ink: 0.12 }));
      for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.34, 0.015), toon('#E7B9A6'), { pos: [sx * 0.2, 0.28, -0.27], ink: 0.12 }));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.05, 10), toon('#C98B5E'), { pos: [0.24, 0.025, -0.1], ink: 0.12 }), mesh(new THREE.IcosahedronGeometry(0.045, 1), toon('#7FB77E'), { pos: [0.24, 0.08, -0.1], ink: 0.1 }));
      break;
    }
  }
  return { group: g, windows };
}

/* ---------------- the small things placed inside (about 0.15 tall) ---------------- */
function buildObject(id, flags, tickers) {
  const g = new THREE.Group();
  switch (id) {
    case 'umbrella': {
      const canopy = mesh(new THREE.ConeGeometry(0.11, 0.05, 8, 1, true), toon('#C8463B', { side: THREE.DoubleSide }), { pos: [0, 0.17, 0], ink: 0.08 });
      g.add(canopy, mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 5), toon('#3E3A4A'), { pos: [0, 0.09, 0] }), mesh(new THREE.TorusGeometry(0.012, 0.003, 4, 10, Math.PI), toon('#3E3A4A'), { pos: [0.012, 0.005, 0], rot: [0, 0, Math.PI] }));
      g.rotation.z = 0.25; break;
    }
    case 'cups': {
      for (const x of [-0.04, 0.04]) {
        const cup = group(mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.04, 14), toon('#F4F1EA'), { pos: [0, 0.03, 0], ink: 0.12 }), mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.006, 16), toon('#F4F1EA'), { pos: [0, 0.006, 0], ink: 0.12 }), mesh(new THREE.TorusGeometry(0.01, 0.003, 4, 10), toon('#F4F1EA'), { pos: [0.028, 0.03, 0] }));
        const steam = mesh(new THREE.IcosahedronGeometry(0.012, 1), toon('#FFFFFF', { opacity: 0.7 }));
        cup.add(steam); tickers.push(t => { const k = (t * 0.4 + x * 5) % 1; steam.position.set(Math.sin(k * 6) * 0.006, 0.06 + k * 0.08, 0); steam.material.opacity = 0.7 * (1 - k); });
        cup.position.x = x; g.add(cup);
      }
      break;
    }
    case 'letter': {
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.008), toon('#F4ECDD'), { pos: [0, 0.045, 0], rot: [-0.25, 0, 0.05], ink: 0.1 }), mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 12), toon('#B9455F'), { pos: [0, 0.05, 0.012], rot: [Math.PI / 2 - 0.25, 0, 0] }));
      break;
    }
    case 'bicycle': {
      const m = toon('#4F6FB0');
      for (const x of [-0.06, 0.06]) g.add(mesh(new THREE.TorusGeometry(0.04, 0.005, 6, 24), toon('#3E3A4A'), { pos: [x, 0.04, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 5), m, { pos: [0, 0.07, 0], rot: [0, 0, Math.PI / 2] }), mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 5), m, { pos: [-0.03, 0.06, 0], rot: [0, 0, -0.6] }), mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 5), m, { pos: [0.045, 0.07, 0], rot: [0, 0, 0.4] }));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.006, 0.014), toon('#3E3A4A'), { pos: [-0.04, 0.095, 0] }), mesh(new THREE.BoxGeometry(0.006, 0.006, 0.05), toon('#3E3A4A'), { pos: [0.06, 0.105, 0] }));
      g.rotation.y = 0.5; break;
    }
    case 'cat': {
      const c = toon('#9C9AA6'), w = toon('#F4F1EA');
      g.add(mesh(new THREE.SphereGeometry(0.045, 14, 10), c, { scale: [1.4, 0.7, 1], pos: [0, 0.03, 0], ink: 0.1 }), mesh(new THREE.SphereGeometry(0.03, 12, 10), c, { pos: [0.05, 0.035, 0.02], ink: 0.1 }), mesh(new THREE.ConeGeometry(0.01, 0.022, 4), c, { pos: [0.055, 0.066, 0.008] }), mesh(new THREE.ConeGeometry(0.01, 0.022, 4), c, { pos: [0.06, 0.064, 0.035] }), mesh(new THREE.SphereGeometry(0.025, 10, 8), c, { scale: [2, 0.6, 0.7], pos: [-0.02, 0.025, 0.05], rot: [0, 0.7, 0], ink: 0.1 }), mesh(new THREE.SphereGeometry(0.012, 8, 6), w, { pos: [0.075, 0.03, 0.03] }));
      tickers.push(t => { g.children[0].scale.y = 0.7 + Math.sin(t * 1.5) * 0.03; });
      break;
    }
    case 'lantern': {
      const glowC = flags.lanternGlow ? '#FFD98A' : '#F7D9A8';
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: glowC, toneMapped: false }));
      body.scale.set(1, 1.2, 1); body.position.y = 0.11;
      g.add(body, mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10), toon('#3E3A4A'), { pos: [0, 0.175, 0] }), mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 4), toon('#3E3A4A'), { pos: [0, 0.03, 0] }));
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(0.05 - Math.abs(i - 1.5) * 0.008, 0.002, 4, 20), toon('#C8463B'), { pos: [0, 0.08 + i * 0.022, 0], rot: [Math.PI / 2, 0, 0] }));
      if (flags.lanternGlow) { const l = new THREE.PointLight('#FFC870', 0.8, 0.8, 2); l.position.y = 0.11; g.add(l); }
      break;
    }
    case 'snowman': {
      const w = toon('#FFFFFF');
      g.add(mesh(new THREE.SphereGeometry(0.05, 14, 10), w, { pos: [0, 0.045, 0], ink: 0.1 }), mesh(new THREE.SphereGeometry(0.036, 14, 10), w, { pos: [0, 0.115, 0], ink: 0.1 }), mesh(new THREE.ConeGeometry(0.008, 0.035, 6), toon('#E8853D'), { pos: [0, 0.118, 0.045], rot: [Math.PI / 2, 0, 0] }), mesh(new THREE.TorusGeometry(0.034, 0.008, 6, 16), toon('#C8463B'), { pos: [0, 0.088, 0], rot: [Math.PI / 2, 0, 0] }));
      break;
    }
    case 'books': {
      const cols = ['#C8463B', '#6F8FC4', '#E6C27A', '#8CC08A'];
      cols.forEach((c, i) => g.add(mesh(new THREE.BoxGeometry(0.11 - i * 0.01, 0.022, 0.08), toon(c), { pos: [i * 0.004, 0.012 + i * 0.023, 0], rot: [0, i * 0.2, 0], ink: 0.1 })));
      break;
    }
    case 'boat': {
      const hullGeo = new THREE.BufferGeometry();
      hullGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.08, 0.04, 0, 0.08, 0.04, 0, 0.05, 0.0, 0, -0.08, 0.04, 0, 0.05, 0.0, 0, -0.05, 0.0, 0], 3)); hullGeo.computeVertexNormals();
      const sailGeo = new THREE.BufferGeometry();
      sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.04, 0.04, 0, 0.04, 0.04, 0, 0, 0.11, 0], 3)); sailGeo.computeVertexNormals();
      const m = toon('#F4F1EA', { side: THREE.DoubleSide });
      g.add(new THREE.Mesh(hullGeo, m), new THREE.Mesh(sailGeo, m));
      g.children.forEach(c => c.add(new THREE.LineSegments(new THREE.EdgesGeometry(c.geometry), new THREE.LineBasicMaterial({ color: '#4A4E7A' }))));
      tickers.push(t => { g.rotation.z = Math.sin(t * 1.4) * 0.06; });
      break;
    }
    case 'bouquet': {
      g.add(mesh(new THREE.ConeGeometry(0.035, 0.1, 10, 1, true), toon('#E9DCC4', { side: THREE.DoubleSide }), { pos: [0, 0.05, 0], rot: [Math.PI, 0, 0], ink: 0.1 }));
      for (let i = 0; i < 6; i++) { const a = i * 1.05; g.add(mesh(new THREE.IcosahedronGeometry(0.02, 1), toon(['#F4B6C6', '#FFFFFF', '#F8DE7E', '#C9B6F0', '#F2A9A0', '#FFFFFF'][i]), { pos: [Math.cos(a) * 0.025, 0.11 + (i % 2) * 0.012, Math.sin(a) * 0.025], ink: 0.12 })); }
      g.rotation.z = -0.25; break;
    }
    case 'dog': {
      const c = toon('#D9B38C'), d = toon('#A97E5A');
      g.add(mesh(new THREE.SphereGeometry(0.05, 14, 10), c, { scale: [1.5, 0.7, 1], pos: [0, 0.034, 0], ink: 0.1 }), mesh(new THREE.SphereGeometry(0.033, 12, 10), c, { pos: [0.065, 0.04, 0.02], ink: 0.1 }),
        mesh(new THREE.SphereGeometry(0.018, 10, 8), d, { pos: [0.062, 0.045, 0.05], scale: [0.6, 1.3, 0.4], rot: [0.3, 0, 0.3] }), mesh(new THREE.SphereGeometry(0.018, 10, 8), d, { pos: [0.07, 0.045, -0.01], scale: [0.6, 1.3, 0.4], rot: [-0.3, 0, 0.3] }),
        mesh(new THREE.SphereGeometry(0.012, 8, 6), toon('#3E3A4A'), { pos: [0.098, 0.036, 0.024] }), mesh(new THREE.SphereGeometry(0.014, 8, 6), c, { scale: [2, 0.6, 0.6], pos: [-0.075, 0.03, 0.02], rot: [0, -0.6, 0] }));
      tickers.push(t => { g.children[0].scale.y = 0.7 + Math.sin(t * 1.3) * 0.03; g.children[5].rotation.y = -0.6 + Math.sin(t * 2.2) * 0.25; });
      break;
    }
    case 'camera': {
      const body = toon('#3E3A4A'), silver = toon('#D5D8DE');
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.075, 0.05), body, { pos: [0, 0.04, 0], ink: 0.1 }), mesh(new THREE.BoxGeometry(0.12, 0.02, 0.05), silver, { pos: [0, 0.087, 0] }),
        mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.03, 18), silver, { pos: [0, 0.04, 0.035], rot: [Math.PI / 2, 0, 0], ink: 0.12 }), mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.032, 16), toon('#2A3A5A'), { pos: [0, 0.04, 0.038], rot: [Math.PI / 2, 0, 0] }),
        mesh(new THREE.BoxGeometry(0.03, 0.018, 0.02), silver, { pos: [-0.035, 0.105, 0] }), mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10), toon('#C8463B'), { pos: [0.04, 0.1, 0] }));
      g.rotation.y = 0.4; break;
    }
    case 'sled': {
      const red = toon('#C8463B'), wood = toon('#C99B78');
      for (const z of [-0.03, 0.03]) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.08, 0.006, z), V(0.06, 0.006, z), V(0.09, 0.02, z), V(0.085, 0.045, z)]), 20, 0.004, 5), red));
      for (const z of [-0.03, 0.03]) for (const x of [-0.05, 0.03]) g.add(mesh(new THREE.BoxGeometry(0.005, 0.03, 0.005), red, { pos: [x, 0.02, z] }));
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.03, 0.006, 0.08), wood, { pos: [-0.055 + i * 0.033, 0.036, 0], ink: 0.15 }));
      g.rotation.y = 0.6; break;
    }
    case 'cake': {
      const cream = toon('#FBF3E8'), pink = toon('#F2B6C2');
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 22), cream, { pos: [0, 0.025, 0], ink: 0.1 }), mesh(new THREE.TorusGeometry(0.058, 0.008, 6, 24), pink, { pos: [0, 0.048, 0], rot: [Math.PI / 2, 0, 0] }),
        mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 20), cream, { pos: [0, 0.068, 0], ink: 0.1 }), mesh(new THREE.TorusGeometry(0.038, 0.006, 6, 20), pink, { pos: [0, 0.084, 0], rot: [Math.PI / 2, 0, 0] }));
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.add(mesh(new THREE.SphereGeometry(0.008, 8, 6), toon('#D9463B'), { pos: [Math.cos(a) * 0.026, 0.09, Math.sin(a) * 0.026] })); }
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), toon('#A9CDF0'), { pos: [0, 0.1, 0] }));
      const flame = mesh(new THREE.SphereGeometry(0.007, 8, 6), glow('#FFD27A'), { pos: [0, 0.122, 0], scale: [1, 1.6, 1] }), fh = halo('#FFC870', 0.06, 0.8); fh.position.y = 0.122;
      g.add(flame, fh);
      tickers.push(t => { const f = 1 + 0.15 * Math.sin(t * 15) * Math.sin(t * 6.1); flame.scale.set(1, 1.6 * f, 1); });
      break;
    }
    case 'telescope': {
      const brass = toon('#C9A15A'), dark = toon('#3E3A4A');
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.11, 5), dark, { pos: [Math.cos(a) * 0.022, 0.05, Math.sin(a) * 0.022], rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] })); }
      const tube = group(mesh(new THREE.CylinderGeometry(0.013, 0.018, 0.13, 14), brass, { ink: 0.12 }), mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.015, 14), dark, { pos: [0, 0.065, 0] }));
      tube.position.set(0, 0.11, 0); tube.rotation.set(0, 0, -0.9); g.add(tube);
      break;
    }
    case 'plant': {
      g.add(mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.045, 14), toon('#D08C64'), { pos: [0, 0.022, 0], ink: 0.12 }), mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 14), toon('#C27B55'), { pos: [0, 0.045, 0] }));
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), toon(i % 2 ? '#7FB77E' : '#93C88A'), { pos: [Math.cos(a) * 0.022, 0.075 + (i % 3) * 0.012, Math.sin(a) * 0.022], scale: [0.6, 1.5, 0.35], rot: [Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5], ink: 0.12 })); }
      g.add(mesh(new THREE.IcosahedronGeometry(0.01, 0), toon('#F4B6C6'), { pos: [0.005, 0.11, 0.005] }));
      break;
    }
    case 'record': {
      g.add(mesh(new THREE.BoxGeometry(0.13, 0.03, 0.11), toon('#A9775A'), { pos: [0, 0.015, 0], ink: 0.1 }));
      const disc = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.004, 24), toon('#2A2830'), { pos: [-0.01, 0.033, 0] });
      disc.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.005, 12), toon('#C8463B')));
      g.add(disc, mesh(new THREE.BoxGeometry(0.004, 0.004, 0.06), toon('#C9A15A'), { pos: [0.045, 0.04, 0.005], rot: [0, 0.4, 0] }));
      tickers.push((t, dt) => { disc.rotation.y += dt * 2.5; });
      break;
    }
  }
  return g;
}

/* ---------------- particles: falling, settling, swirling ---------------- */
const WEATHER = {
  snow: { n: 280, size: 0.045, tex: 'flake', g: 0.16, term: 0.13, drag: 1.4, settle: true, wobble: 0.04 },
  petals: { n: 160, size: 0.05, tex: 'petal', g: 0.12, term: 0.1, drag: 1.6, settle: true, wobble: 0.08, cols: ['#F7BCCD', '#FBD3DE', '#F4A9BE'] },
  leaves: { n: 140, size: 0.055, tex: 'petal', g: 0.15, term: 0.12, drag: 1.6, settle: true, wobble: 0.09, cols: ['#E59A4E', '#D46E58', '#E8B65A', '#B9573E'] },
  rain: { n: 120, size: 0.06, tex: 'drop', g: 1.4, term: 0.9, drag: 0.6, loop: true, cols: ['#BFD8F2'] },
  fireflies: { n: 50, size: 0.07, tex: 'dot', g: 0, drag: 1.2, wander: 0.18, additive: true, cols: ['#EAFF9C'] },
  stars: { n: 60, size: 0.06, tex: 'star', g: 0.1, term: 0.08, drag: 1.2, loop: true, additive: true, cols: ['#FFF2B8'] },
  gold: { n: 300, size: 0.024, tex: 'dot', g: 0.05, term: 0.04, drag: 1.4, settle: true, additive: true, wobble: 0.03, cols: ['#F2CF72', '#FFE6A3'] },
  bubbles: { n: 40, size: 0.075, tex: 'ring', g: -0.12, term: 0.12, drag: 1.0, loop: true, cols: ['#DDF0FF', '#FFE6F2', '#EDE6FF'] },
  confetti: { n: 190, size: 0.065, tex: 'square', g: 0.13, term: 0.1, drag: 1.7, settle: true, wobble: 0.08, flip: true, cols: ['#EE8FA8', '#7FB2E6', '#F2C94C', '#8FCB84', '#A994E8', '#F4A06B'] },
  dandelion: { n: 70, size: 0.085, tex: 'seed', g: 0.035, term: 0.035, drag: 1.0, settle: true, wander: 0.04, cols: ['#FFFFFF'] },
  silver: { n: 320, size: 0.03, tex: 'star', g: 0.06, term: 0.05, drag: 1.4, settle: true, additive: true, wobble: 0.03, cols: ['#E8ECF6', '#FFFFFF', '#CFD8F0'] }
};
WEATHER.petals.flip = WEATHER.leaves.flip = true;

/** Points with their own size and spin (petals tumble, confetti flips), drawn from one sprite. */
function particleMaterial(tex, { size, additive, opacity = 1, flip = false }) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { map: { value: tex }, uSize: { value: size }, uScale: { value: 400 }, uTime: { value: 0 }, uOpacity: { value: opacity }, uFlip: { value: flip ? 1 : 0 } },
    vertexShader: `attribute float aSize; attribute float aRot; uniform float uSize; uniform float uScale; uniform float uTime; uniform float uFlip;
      varying vec3 vColor; varying float vRot; varying float vSquash;
      void main(){
        vColor = color;
        vRot = aRot + uTime * (fract(aRot * 3.7) - 0.5) * 2.4 * uFlip;
        vSquash = mix(1.0, max(0.18, abs(cos(uTime * (1.0 + fract(aRot * 5.3) * 2.0) + aRot * 7.0))), uFlip);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * aSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D map; uniform float uOpacity; varying vec3 vColor; varying float vRot; varying float vSquash;
      void main(){
        vec2 p = gl_PointCoord - 0.5; p.x /= vSquash;
        float c = cos(vRot), s = sin(vRot); p = mat2(c, -s, s, c) * p;
        if (abs(p.x) > 0.5 || abs(p.y) > 0.5) discard;
        vec4 t = texture2D(map, p + 0.5);
        if (t.a < 0.03) discard;
        gl_FragColor = vec4(vColor * t.rgb, t.a * uOpacity);
        #include <colorspace_fragment>
      }`
  });
}
function buildParticles(kind, shape, rand) {
  const W = WEATHER[kind], n = W.n;
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), rest = new Uint8Array(n), seed = new Float32Array(n), col = new Float32Array(n * 3);
  const c = new THREE.Color();
  const randomInside = (i, yMin, yMax) => {
    const y = yMin + rand() * (yMax - yMin), r = shape.r(y) * 0.85 * Math.sqrt(rand()), a = rand() * Math.PI * 2;
    pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
  };
  for (let i = 0; i < n; i++) {
    seed[i] = rand();
    // start settled on the ground (settling kinds) or spread through the glass
    if (W.settle) { randomInside(i, shape.ground + 0.012, shape.ground + 0.02); pos[i * 3 + 1] = shape.ground + 0.012 + seed[i] * 0.012; rest[i] = 1; }
    else randomInside(i, shape.ground + 0.05, shape.top - 0.1);
    c.set((W.cols || ['#FFFFFF'])[i % (W.cols || ['#FFFFFF']).length]); col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(Float32Array.from({ length: n }, () => 0.6 + rand() * 0.8), 1));
  geo.setAttribute('aRot', new THREE.BufferAttribute(Float32Array.from({ length: n }, () => rand() * Math.PI * 2), 1));
  const mat = particleMaterial(spriteTex(W.tex), { size: W.size * 1.05, additive: W.additive, opacity: kind === 'bubbles' ? 0.75 : 1, flip: !!W.flip });
  const pts = new THREE.Points(geo, mat); pts.renderOrder = 5; pts.frustumCulled = false;
  const buf = new THREE.Vector2();
  pts.onBeforeRender = r => { r.getDrawingBufferSize(buf); mat.uniforms.uScale.value = buf.y * 0.5; };
  let swirl = 0;
  const v3 = new THREE.Vector3();
  return {
    points: pts,
    shake(strength = 1) {
      swirl += (rand() < 0.5 ? -1 : 1) * 2.2 * strength;
      for (let i = 0; i < n; i++) {
        rest[i] = 0;
        vel[i * 3] += (rand() - 0.5) * 0.8 * strength; vel[i * 3 + 2] += (rand() - 0.5) * 0.8 * strength;
        vel[i * 3 + 1] += (0.4 + rand() * 1.1) * strength * (W.g < 0 ? 0.3 : 1);
      }
    },
    update(t, dt) {
      swirl *= Math.exp(-0.8 * dt);
      for (let i = 0; i < n; i++) {
        if (rest[i]) continue;
        const k = i * 3;
        let x = pos[k], y = pos[k + 1], z = pos[k + 2];
        let vx = vel[k], vy = vel[k + 1], vz = vel[k + 2];
        vy -= W.g * dt;
        if (W.wander) { vx += Math.sin(t * 1.3 + seed[i] * 40) * W.wander * dt * 3; vy += Math.cos(t * 1.1 + seed[i] * 31) * W.wander * dt * 3; vz += Math.sin(t * 0.9 + seed[i] * 17) * W.wander * dt * 3; }
        if (W.wobble) { vx += Math.sin(t * 2 + seed[i] * 20) * W.wobble * dt; vz += Math.cos(t * 1.7 + seed[i] * 13) * W.wobble * dt; }
        // the swirl of the shake: tangential motion around the vertical axis
        vx += -z * swirl * dt * 1.2; vz += x * swirl * dt * 1.2;
        const d = Math.exp(-W.drag * dt); vx *= d; vy *= d; vz *= d;
        if (W.term && vy < -W.term && swirl * swirl < 0.3) vy += (-W.term - vy) * Math.min(1, dt * 4);
        x += vx * dt; y += vy * dt; z += vz * dt;
        // stay inside the glass
        const top = shape.top - 0.06, ground = shape.ground + 0.012;
        if (y > top) { y = top; vy = -Math.abs(vy) * 0.3; }
        const rmax = shape.r(y) * 0.9, rr = Math.hypot(x, z);
        if (rr > rmax) { const s = rmax / rr; x *= s; z *= s; vx *= -0.3; vz *= -0.3; }
        if (y < ground) {
          if (W.settle) { y = ground + seed[i] * 0.012; vx = vy = vz = 0; if (swirl * swirl < 0.5) rest[i] = 1; }
          else if (W.loop && W.g > 0) { v3.set(0, 0, 0); const a = rand() * 6.28, r = shape.r(top - 0.1) * 0.7 * Math.sqrt(rand()); x = Math.cos(a) * r; z = Math.sin(a) * r; y = top - 0.05 - rand() * 0.2; vy = -W.term * 0.5; }
          else { y = ground; vy = Math.abs(vy) * 0.4; }
        }
        if (W.loop && W.g < 0 && y >= top - 0.01) { const a = rand() * 6.28, r = shape.groundR * 0.6 * Math.sqrt(rand()); x = Math.cos(a) * r; z = Math.sin(a) * r; y = ground + 0.02; vy = 0.02; }
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z; vel[k] = vx; vel[k + 1] = vy; vel[k + 2] = vz;
      }
      geo.attributes.position.needsUpdate = true;
      mat.uniforms.uTime.value = t;
      if (W.additive) mat.uniforms.uOpacity.value = 0.75 + 0.25 * Math.sin(t * 2.4);
    }
  };
}

/* ---------------- the plaque on the base ---------------- */
const PLAQUE_SERIF = '"Cormorant Garamond", "Noto Serif SC", "Songti SC", Georgia, serif';
function drawPlaque(g, w, h, title, date) {
    g.clearRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#E9D6A6'); grad.addColorStop(0.45, '#C9A866'); grad.addColorStop(0.6, '#E6D19C'); grad.addColorStop(1, '#B8924A');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,55,15,.5)'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#4A3A1C'; g.textAlign = 'center';
    const cjk = /[\u2E80-\u9FFF]/.test(title);
    g.font = `${cjk ? '' : 'italic '}600 ${cjk ? 46 : 52}px ${PLAQUE_SERIF}`; g.fillText(title, w / 2, 80, w - 60);
    g.font = `500 ${/[\u2E80-\u9FFF]/.test(date) ? 22 : 21}px "DM Sans", "Noto Serif SC", sans-serif`;
    g.fillText(/[\u2E80-\u9FFF]/.test(date) ? date : date.toUpperCase().split('').join(String.fromCharCode(8202)), w / 2, 124, w - 60);
}
function plaqueTexture(title, date) {
  const tex = canvasTex(512, 160, (g, w, h) => drawPlaque(g, w, h, title, date));
  tex.redraw = (t, d) => { const c = tex.image; drawPlaque(c.getContext('2d'), c.width, c.height, t, d); tex.needsUpdate = true; };
  // redraw once the fonts (including Chinese) have arrived
  document.fonts?.load?.(`600 46px ${PLAQUE_SERIF}`, title + date).then(() => tex.redraw(title, date)).catch(() => {});
  return tex;
}

/* ---------------- build ---------------- */
export function build(spec, seed, { renderer, date: when, plaque: engraving } = {}) {
  const rand = rngFor(seed, 'globe');
  const env = studio(renderer);
  const pal = spec.palette, P = spec.picks;
  const world = new THREE.Group(), skyLayer = new THREE.Group();
  const parts = {}, tickers = [];
  const reg = (slot, o) => { (parts[slot] ||= []).push(o); return o; };
  const shape = glassShape(P.glass.id);
  const BASE_TOP = -0.8;

  // lights: neutral until the hour is revealed
  const hemi = new THREE.HemisphereLight('#FFFFFF', '#D8CFC8', 1.2);
  const key = new THREE.DirectionalLight('#FFFFFF', 1.6); key.position.set(-2.5, 3, 4);
  shadowKey(key, 1.25, 1024); // the little scene inside casts soft shadows on its own ground
  const rimL = new THREE.DirectionalLight('#FFFFFF', 0.55); rimL.position.set(2.5, 1.2, -3);
  const lampLight = new THREE.PointLight('#FFC27A', 0, 2.2, 1.6); lampLight.position.set(0, 0.35, 0.1);
  skyLayer.add(new THREE.Group().add(hemi, key, rimL));
  const lit = { hour: false };
  function setHour(on) {
    lit.hour = on;
    hemi.color.set(on ? pal.light : '#FFFFFF'); hemi.groundColor.set(on && pal.dark ? '#3A3F6A' : '#D8CFC8'); hemi.intensity = on ? pal.amb : 1.2;
    key.color.set(on ? pal.light : '#FFFFFF'); key.intensity = on ? (pal.dark ? 0.7 : 1.5) : 1.6;
    lampLight.intensity = on && pal.lamps ? 0.8 : 0;
    rimL.color.set(on && pal.dark ? '#AFC0FF' : '#FFF4E8');
    for (const w of windows) w.material.color.set(on && pal.lamps ? '#FFD98A' : '#EAF0F6');
    for (const hh of windowHalos) hh.visible = on && !!pal.lamps;
    if (auroraG) auroraG.visible = on;
  }
  const windowHalos = [];
  let auroraG = null;

  /* base (keepsake half) */
  const baseMats = {
    walnut: () => new THREE.MeshPhysicalMaterial({ map: woodTex('#6E4A33'), roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.25, envMap: env, envMapIntensity: 0.6 }),
    oak: () => new THREE.MeshPhysicalMaterial({ map: woodTex('#D9BE96'), roughness: 0.55, clearcoat: 0.4, envMap: env, envMapIntensity: 0.5 }),
    marble: () => new THREE.MeshPhysicalMaterial({ map: marbleTex(), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 0.9 }),
    brass: () => new THREE.MeshStandardMaterial({ color: '#C9A15A', metalness: 1, roughness: 0.28, envMap: env, envMapIntensity: 1.2 }),
    porcelain: () => new THREE.MeshPhysicalMaterial({ color: '#F7F5F2', roughness: 0.12, clearcoat: 1, envMap: env, envMapIntensity: 0.9 }),
    lacquer: () => new THREE.MeshPhysicalMaterial({ color: '#1F2A55', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, envMap: env, envMapIntensity: 1.1 }),
    celadon: () => new THREE.MeshPhysicalMaterial({ color: '#A9C7B5', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.3, sheenColor: new THREE.Color('#E6F4EC'), envMap: env, envMapIntensity: 1.0 }),
    velvet: () => new THREE.MeshPhysicalMaterial({ color: '#C99AA4', roughness: 0.92, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color('#F6DCE2'), envMap: env, envMapIntensity: 0.4 }),
    silver: () => new THREE.MeshStandardMaterial({ color: '#D5D8DE', metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: 1.3 })
  };
  const gold = new THREE.MeshStandardMaterial({ color: '#D9B46A', metalness: 1, roughness: 0.25, envMap: env, envMapIntensity: 1.2 });
  const prof = [[0, -1.3], [0.98, -1.3], [1.02, -1.27], [1.02, -1.2], [0.97, -1.16], [0.93, -0.97], [0.86, -0.9], [0.86, -0.86], [0.7, -0.83], [0.66, BASE_TOP], [0, BASE_TOP]];
  const baseGeo = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 96);
  const base = new THREE.Mesh(baseGeo, baseMats[P.base.id]());
  base.userData.pick = 'base';
  world.add(base); reg('base', base);
  if (['porcelain', 'lacquer', 'celadon', 'velvet'].includes(P.base.id)) {
    for (const [r, y] of [[1.02, -1.235], [0.86, -0.88]]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.01, 8, 96), gold); rim.rotation.x = Math.PI / 2; rim.position.y = y; world.add(rim); reg('base', rim); }
  }
  if (shape.pedestal) {
    const ped = new THREE.Mesh(new THREE.LatheGeometry([[0.3, BASE_TOP], [0.22, -0.65], [0.2, -0.5], [0.6, -0.42], [0.6, -0.38], [0, -0.38]].map(([x, y]) => new THREE.Vector2(x, y)), 64), base.material);
    world.add(ped); reg('base', ped);
  }
  // plaque with the name and the date
  // the date of the round (when it was opened), so a kept globe always shows the same plaque
  const d0 = new Date(when || Date.now());
  const date = (Number.isFinite(d0.getTime()) ? d0 : new Date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const plaqueTex = plaqueTexture(engraving?.name || spec.title, engraving?.date || date);
  const plaque = new THREE.Mesh(new THREE.CylinderGeometry(0.942, 0.97, 0.15, 48, 1, true, -0.5, 1.0), new THREE.MeshStandardMaterial({ map: plaqueTex, metalness: 0.6, roughness: 0.35, envMap: env, envMapIntensity: 0.8 }));
  plaque.position.y = -1.04; // the open cylinder segment is centred on +z: the front
  world.add(plaque); reg('base', plaque);

  // where the glass meets the base: a thin metal collar
  const silverM = new THREE.MeshStandardMaterial({ color: '#DCDFE6', metalness: 1, roughness: 0.2, envMap: env, envMapIntensity: 1.3 });
  {
    const yS = shape.pedestal ? -0.38 : BASE_TOP, rS = shape.r(yS);
    if (rS > 0.1) { const collar = new THREE.Mesh(new THREE.TorusGeometry(rS + 0.005, 0.016, 10, shape.facet ? 8 : 96), ['marble', 'silver', 'oak'].includes(P.base.id) ? silverM : gold); collar.rotation.x = Math.PI / 2; collar.position.y = yS + 0.004; if (shape.facet) collar.rotation.z = Math.PI / 8; world.add(collar); reg('base', collar); }
  }
  // it stands on something: a soft contact shadow under the base
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), new THREE.MeshBasicMaterial({ map: spriteTex('shadow'), transparent: true, opacity: pal.dark ? 0.75 : 0.55, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = -1.302; contact.raycast = () => {}; contact.renderOrder = -1;
  world.add(contact); reg('base', contact);

  /* finishing touch (keepsake half) */
  const finish = new THREE.Group(); world.add(finish); reg('finish', finish);
  switch (P.finish.id) {
    case 'bow': {
      const rib = toon('#D98A9B');
      const bow = group(mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 20), rib, { pos: [-0.07, 0, 0], scale: [1, 0.7, 0.4], rot: [0, 0, 0.3], ink: 0.08 }), mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 20), rib, { pos: [0.07, 0, 0], scale: [1, 0.7, 0.4], rot: [0, 0, -0.3], ink: 0.08 }), mesh(new THREE.SphereGeometry(0.03, 12, 10), rib, { ink: 0.08 }), mesh(new THREE.BoxGeometry(0.03, 0.14, 0.008), rib, { pos: [-0.03, -0.08, 0], rot: [0, 0, 0.3] }), mesh(new THREE.BoxGeometry(0.03, 0.14, 0.008), rib, { pos: [0.03, -0.08, 0], rot: [0, 0, -0.3] }));
      bow.position.set(0, -0.86, 0.88); finish.add(bow);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.865, 0.012, 8, 96), rib); band.rotation.x = Math.PI / 2; band.position.y = -0.88; finish.add(band);
      break;
    }
    case 'pearls': {
      const n = 46, pearl = new THREE.MeshPhysicalMaterial({ color: '#F4EEE6', roughness: 0.25, clearcoat: 0.9, iridescence: 0.8, iridescenceIOR: 1.35, sheen: 0.5, sheenColor: new THREE.Color('#FFE6EE'), envMap: env, envMapIntensity: 1 });
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.036, 16, 12), pearl, n), m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; m4.makeTranslation(Math.cos(a) * 0.86, -0.865, Math.sin(a) * 0.86); im.setMatrixAt(i, m4); }
      finish.add(im); break;
    }
    case 'band': {
      for (const [r, y, t] of [[0.95, -1.03, 0.014], [0.97, -1.11, 0.008]]) { const b = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 96), gold); b.rotation.x = Math.PI / 2; b.position.y = y; finish.add(b); }
      break;
    }
    case 'flowers': {
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + 0.2, f = new THREE.Group();
        for (let k = 0; k < 5; k++) { const pa = k / 5 * Math.PI * 2; f.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), toon(['#F4B6C6', '#FFFFFF', '#C9B6F0', '#F8DE7E'][i % 4]), { pos: [Math.cos(pa) * 0.02, 0, Math.sin(pa) * 0.02], scale: [1, 0.5, 1] })); }
        f.add(mesh(new THREE.SphereGeometry(0.01, 8, 6), toon('#E6B84A'), { pos: [0, 0.006, 0] }));
        for (let k = 0; k < 2; k++) f.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), toon('#8CC08A'), { pos: [0.03 * (k ? 1 : -1), -0.004, 0.01], scale: [1.4, 0.3, 0.7] }));
        f.position.set(Math.cos(a) * 0.86, -0.855, Math.sin(a) * 0.86); finish.add(f);
      }
      break;
    }
    case 'star': {
      const sh = new THREE.Shape(); for (let i = 0; i <= 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.045 : 0.11; i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3 }); sg.center();
      const star = new THREE.Mesh(sg, gold); const holder = group(star, at(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.06, 10), gold), 0, -0.13, 0));
      holder.position.y = shape.top + 0.14; finish.add(holder);
      const sh2 = halo('#FFE6A0', 0.34, 0.45); sh2.position.y = shape.top + 0.14; finish.add(sh2);
      tickers.push(t => { star.rotation.y = Math.sin(t * 0.6) * 0.5; sh2.material.opacity = 0.35 + 0.15 * Math.sin(t * 1.8); });
      break;
    }
    case 'lace': {
      const white = new THREE.MeshPhysicalMaterial({ color: '#FBF8F2', roughness: 0.8, sheen: 0.6, sheenColor: new THREE.Color('#FFFFFF'), envMap: env, envMapIntensity: 0.4 });
      const n = 40, im = new THREE.InstancedMesh(new THREE.CircleGeometry(0.045, 14, 0, Math.PI), white, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; e.set(0, -a + Math.PI / 2, Math.PI); q.setFromEuler(e); m4.compose(V(Math.cos(a) * 0.995, -1.17, Math.sin(a) * 0.995), q, V(1, 1, 1)); im.setMatrixAt(i, m4); }
      white.side = THREE.DoubleSide; finish.add(im);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.99, 0.012, 6, 96), white); band.rotation.x = Math.PI / 2; band.position.y = -1.17; finish.add(band);
      break;
    }
    case 'bell': {
      const prof = [[0.0, 0.0], [0.025, 0.004], [0.055, 0.016], [0.058, 0.026], [0.048, 0.05], [0.038, 0.08], [0.024, 0.1], [0.0, 0.104]].map(([x, y]) => new THREE.Vector2(x, y));
      const bellM = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), gold);
      const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), gold); clapper.position.y = -0.005;
      const hold = new THREE.Group(); hold.add(at(bellM, 0, -0.11, 0), at(clapper, 0, -0.115, 0));
      const rib = mesh(new THREE.BoxGeometry(0.016, 0.07, 0.004), toon('#D98A9B'), { pos: [0, -0.035, 0] }); hold.add(rib);
      hold.position.set(0.0, -0.86, 0.9); finish.add(hold);
      const sp = { a: 0, v: 0 };
      tickers.push((t, dt) => { sp.v += (-30 * sp.a - 1.6 * sp.v) * dt; sp.a += sp.v * dt; hold.rotation.z = sp.a + Math.sin(t * 1.1) * 0.03; clapper.position.x = -sp.a * 0.03; });
      finish.userData.ring = k => { sp.v += 3 * k * (Math.random() < 0.5 ? -1 : 1); };
      break;
    }
    case 'key': {
      const k = group(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 10), gold, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.06] }), mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20), gold, { pos: [-0.04, 0, 0.13] }), mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20), gold, { pos: [0.04, 0, 0.13] }));
      const holder = group(k); holder.position.set(0, -1.05, -0.96); holder.rotation.y = Math.PI; finish.add(holder);
      tickers.push((t, dt) => { k.rotation.z += dt * 0.5; });
      break;
    }
  }

  /* glass (keepsake half) */
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.05, roughness: 0.02, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.02, envMap: env, envMapIntensity: shape.facet ? 0.9 : 0.75, specularIntensity: 1, depthWrite: false, flatShading: !!shape.facet });
  const glass = new THREE.Mesh(shape.geo, glassMat);
  if (shape.center !== undefined) glass.position.y = shape.center;
  glass.renderOrder = 10; glass.raycast = () => {};
  const rim = new THREE.Mesh(shape.geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color(pal.dark ? '#C9D3FF' : '#FFFFFF') }, k: { value: pal.dark ? 0.5 : 0.3 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 c; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.0-abs(dot(vN,vV)),4.0); gl_FragColor=vec4(c, f*k); }'
  }));
  rim.position.y = glass.position.y; rim.renderOrder = 11; rim.raycast = () => {};
  world.add(glass, rim); reg('glass', glass); reg('glass', rim);
  // the globe is full of water: a faint tint on the far wall, so the inside reads as a volume
  const liquid = new THREE.Mesh(shape.geo, new THREE.MeshBasicMaterial({ color: pal.dark ? '#3A4A86' : '#E6EEF8', transparent: true, opacity: pal.dark ? 0.15 : 0.12, side: THREE.BackSide, depthWrite: false }));
  liquid.position.y = glass.position.y; liquid.scale.setScalar(0.985); liquid.raycast = () => {}; liquid.renderOrder = 1;
  world.add(liquid); reg('glass', liquid);
  // reflections of a window: fixed to the view (they belong to the light, not to the glass), so they stay put as it turns
  {
    const yc = shape.center ?? (shape.ground + shape.top) / 2 + 0.05, Rr = Math.max(0.4, shape.r(yc));
    const streak = (x, y, w, hgt, rot, op) => {
      const rr = shape.r(y), z = Math.sqrt(Math.max(0.01, rr * rr - x * x)) + 0.01;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshBasicMaterial({ map: spriteTex('streak'), transparent: true, opacity: op, depthWrite: false, color: '#FFFFFF' }));
      m.position.set(x, y, z); m.rotation.z = rot; m.renderOrder = 12; m.raycast = () => {}; m.userData.keepInCapture = true;
      skyLayer.add(m); reg('glass', m);
    };
    streak(-Rr * 0.5, yc + Rr * 0.22, Rr * 0.16, Rr * 0.62, 0.42, pal.dark ? 0.38 : 0.55);
    streak(-Rr * 0.3, yc + Rr * 0.5, Rr * 0.07, Rr * 0.24, 0.6, pal.dark ? 0.3 : 0.45);
    streak(Rr * 0.58, yc - Rr * 0.18, Rr * 0.06, Rr * 0.4, -0.25, pal.dark ? 0.18 : 0.28);
  }
  const ghost = new THREE.Mesh(shape.geo, new THREE.MeshBasicMaterial({ color: pal.dark ? '#8C90B8' : '#B9B0C2', transparent: true, opacity: 0.08, depthWrite: false }));
  ghost.position.y = glass.position.y; ghost.raycast = () => {}; ghost.visible = false; world.add(ghost);

  /* inside: ground, place (moment half), the two placed things */
  const inside = new THREE.Group(); inside.position.y = shape.ground; inside.scale.setScalar(shape.scale); world.add(inside);
  const groundColors = { cabin: '#9DB98A', street: '#B3ABB0', seaside: '#EAD7AF', platform: '#B9B2AE', bench: '#9DC08E', rooftop: '#A9A0A4', bookshop: '#B3ABB0', pier: '#9DB98A', garden: '#A7C99A', window: '#C9A784', cafe: '#C9BBA9', ferris: '#B9C79E', campsite: '#9DB98A', lighthouse: '#CFC4B6' };
  const snowy = P.weather.id === 'snow';
  const gR = shape.groundR / shape.scale;
  const groundGeo = new THREE.LatheGeometry([[0, -0.06], [gR, -0.06], [gR, -0.01], [gR * 0.92, 0.012], [gR * 0.5, 0.02], [0, 0.022]].map(([x, y]) => new THREE.Vector2(x, y)), 64);
  const ground = outline(new THREE.Mesh(groundGeo, toon(snowy ? '#F6F8FC' : groundColors[P.place.id])), 0.01);
  ground.userData.pick = 'place';
  const placeG = new THREE.Group(); inside.add(placeG); reg('place', placeG);
  placeG.add(ground);
  const { group: scene, windows } = buildPlace(P.place.id, P, pal.lamps, spec.flags, rand);
  scene.position.y = 0.02; scene.userData.pick = 'place'; placeG.add(scene);
  scene.add(lampLight);
  if (scene.userData.tick) tickers.push(scene.userData.tick);
  // lit windows glow a little beyond themselves
  for (const w of windows) { const hh = halo('#FFD98A', w.geometry.type === 'SphereGeometry' ? 0.07 : 0.16, 0.6); w.add(hh); hh.visible = false; windowHalos.push(hh); }
  // the northern lights, hung inside the glass behind the scene
  if (pal.aurora) {
    auroraG = new THREE.Group(); auroraG.position.set(0, (shape.top - shape.ground) / shape.scale * 0.62, -0.3); inside.add(auroraG); reg('hour', auroraG);
    const mats = [];
    [['#7DF2C9', 0, 0], ['#A98BFF', 0.1, 1.6], ['#6FD6F2', 0.2, 2.8]].forEach(([c, y, ph]) => {
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { t: { value: 0 }, c: { value: new THREE.Color(c) }, ph: { value: ph } },
        vertexShader: 'uniform float t; uniform float ph; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.y += sin(p.x * 5.0 + t * 0.6 + ph) * 0.03; p.z += cos(p.x * 4.0 + t * 0.4 + ph) * 0.04; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
        fragmentShader: 'uniform vec3 c; uniform float t; varying vec2 vUv; void main(){ float a = smoothstep(0.0, 0.4, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y)) * smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x)); a *= 0.35 + 0.65 * pow(0.5 + 0.5 * sin(vUv.x * 40.0 + sin(vUv.x * 7.0 + t * 0.8) * 3.0), 2.0); gl_FragColor = vec4(c, a * 0.55); }' });
      const band = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.16, 48, 1), m); band.position.set(0, y, -y * 0.3); band.rotation.z = 0.12; auroraG.add(band); mats.push(m);
    });
    tickers.push(t => mats.forEach(m => { m.uniforms.t.value = t; }));
  }
  shadows(inside);
  ground.receiveShadow = true;
  spec.objects.forEach((obj, i) => {
    const o = buildObject(obj.id, spec.flags, tickers);
    o.position.set(i ? 0.24 : -0.24, 0.02, 0.3 - (i ? 0.02 : 0)); o.rotation.y += i ? -0.4 : 0.4;
    o.scale.setScalar(1.25);
    const slot = i ? 'object-ai' : 'object-human';
    o.userData.pick = slot; inside.add(o); reg(slot, o);
  });

  /* weather (moment half) */
  const fx = buildParticles(P.weather.id, { ...shape, r: y => shape.r(y) }, rand);
  world.add(fx.points); reg('weather', fx.points);
  tickers.push((t, dt) => fx.update(t, dt));

  let time = 0;
  const kickShake = s => fx.shake(s);
  setHour(true);
  setTimeout(() => kickShake(0.7), 400); // it arrives freshly shaken
  return {
    world, skyLayer, parts,
    frame: { dist: 6.0, objectDist: 4.4, camY: 0.45, lookY: -0.12, fitAspect: false, halfWidth: 1.2, turn: 'y', ornament: 'sparkles' },
    spots: { front: V(0, 0, 1) },
    update(dt) { time += dt; for (const f of tickers) f(time, dt); },
    prepareReveal() { for (const objs of Object.values(parts)) objs.forEach(o => { o.visible = false; }); ghost.visible = true; setHour(false); },
    reveal(slot, tween) {
      if (slot === 'hour') { setHour(true); return true; }
      const objs = parts[slot]; if (!objs) return false;
      if (slot === 'glass') { ghost.visible = false; objs.forEach(o => { o.visible = true; }); const target = glassMat.opacity; tween(1.0, e => { glassMat.opacity = target * e; }); return true; }
      if (slot === 'weather') { objs.forEach(o => { o.visible = true; }); setTimeout(() => kickShake(1.4), 250); return true; }
      objs.forEach((o, k) => {
        const s0 = o.scale.clone(); o.scale.copy(s0).multiplyScalar(0.001); o.visible = true;
        tween(0.8, e => o.scale.copy(s0).multiplyScalar(0.001 + 0.999 * e), k2 => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k2 - 1, 3) + c1 * Math.pow(k2 - 1, 2); }, k * 0.08);
      });
      return true;
    },
    revealAll() { for (const objs of Object.values(parts)) objs.forEach(o => { o.visible = true; }); ghost.visible = false; setHour(true); },
    /** Any touch shakes it a little; a drag shakes it as hard as you drag. */
    touch(pick, strength = 1) { kickShake(0.5 * Math.min(2, strength)); finish.userData.ring?.(Math.min(2, strength)); },
    drag(dx) { if (Math.abs(dx) > 0.004) { kickShake(Math.min(1.2, Math.abs(dx) * 14)); finish.userData.ring?.(Math.min(1, Math.abs(dx) * 10)); } },
    shake: kickShake,
    /** Re-engrave the plaque (a name and a date chosen by the people who keep it). */
    setPlaque(name, d) { plaqueTex.redraw(name || spec.title, d || date); },
    dispose() { [world, skyLayer].forEach(g => g.traverse(o => o.geometry?.dispose?.())); }
  };
}
