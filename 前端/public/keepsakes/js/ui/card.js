// The last beat of a reveal: each sealed hidden line ("wish") is opened as a small pop-up greeting card.
// Paper layers stand up from the fold as it opens (CSS 3D, no WebGL), the line writes itself in ink,
// and the card tilts under your finger. All artwork is drawn here as SVG: ink lines, watercolour washes,
// a ribbon frame, roses and gold-foil sparkles. Fonts (used on the cards only): Xiaolai SC / Kose Font, a Chinese
// handwriting face grown from the Japanese SetoFont (OFL), and Pinyon Script (OFL) for the little script titles.
import { rngFor } from '../engine/codec.js';
import { sealSVG } from './seal.js';

const FONT_CSS = 'https://cdn.jsdelivr.net/npm/@chinese-fonts/xiaolai@3.0.0/dist/Xiaolai/result.css';
export const CARD_FONT = '"Xiaolai SC", "Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", serif';

/** Load the card fonts once (the Chinese font arrives in small unicode-range pieces, only for the characters used). */
export function preloadCardFonts() {
  if (document.getElementById('card-fonts')) return;
  const l = document.createElement('link');
  l.id = 'card-fonts'; l.rel = 'stylesheet'; l.href = FONT_CSS; l.crossOrigin = 'anonymous';
  document.head.append(l);
}

const PALETTES = {
  rose: { wax: '#CF7C8B', paper: '#FCF5EE', paper2: '#F5DAD5', floor: '#F1CBC6', wash: '#F3C3C6', ink: '#7A2E38', petal: ['#EBA7AE', '#DB7A86', '#C45666'], petalHi: '#F8D7DA', leaf: '#93B29A', leafInk: '#4F7560', ribbon: '#F3C1CA', ribbonInk: '#BF6476', gold: '#D6AE57', text: '#9A3B33', seal: '#B3485C' },
  lilac: { wax: '#8E96D2', paper: '#F8F6FC', paper2: '#E3E3F4', floor: '#D7DBF0', wash: '#CFD4F2', ink: '#3D4678', petal: ['#BDB8EA', '#9E9CDB', '#7F87CB'], petalHi: '#E6E4F8', leaf: '#93B29A', leafInk: '#4F7560', ribbon: '#CAD5F2', ribbonInk: '#6B7FBD', gold: '#D6AE57', text: '#3B4A86', seal: '#5A6DAA' }
};

/* ------------------------------------------------------------------ drawing helpers (SVG strings) */
const f2 = n => n.toFixed(1);
function pathOf(pts, close = false) {
  let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i], [nx, ny] = pts[i + 1]; d += ` Q${f2(x)} ${f2(y)} ${f2((x + nx) / 2)} ${f2((y + ny) / 2)}`; }
  const last = pts[pts.length - 1]; d += ` L${f2(last[0])} ${f2(last[1])}`;
  return d + (close ? 'Z' : '');
}
function blob(cx, cy, r, rnd, bumps = 7, wob = 0.1) {
  const pts = [], ph = rnd() * 6;
  for (let i = 0; i <= 36; i++) { const a = i / 36 * Math.PI * 2, k = 1 + wob * Math.sin(a * bumps + ph) + (rnd() - 0.5) * 0.05; pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * 0.92]); }
  return pathOf(pts, true);
}
function rose(cx, cy, r, P, rnd, k = rnd()) {
  const c = P.petal[Math.floor(k * P.petal.length) % P.petal.length], w = Math.max(0.8, r * 0.065);
  const J = () => (rnd() - 0.5) * r * 0.06;
  // watercolour: a wash, a lighter wash slightly off-register, a deeper cup at the heart
  let s = `<path d="${blob(cx, cy, r, rnd)}" fill="${c}" opacity=".92" filter="url(#gc-wash)"/>`;
  s += `<path d="${blob(cx - r * 0.16, cy - r * 0.2, r * 0.62, rnd, 5, 0.12)}" fill="${P.petalHi}" opacity=".55" filter="url(#gc-wash)"/>`;
  s += `<path d="${blob(cx + r * 0.04, cy - r * 0.06, r * 0.4, rnd, 4, 0.1)}" fill="${P.petal[2]}" opacity=".45" filter="url(#gc-wash)"/>`;
  // ink: a small swirl at the heart, a ring of cupped petals, a scalloped outer edge
  const ph = rnd() * 6, sw = [];
  for (let i = 0; i <= 22; i++) { const t = i / 22, a = ph + t * 1.5 * Math.PI * 2, rr = r * (0.06 + 0.3 * t); sw.push([cx + Math.cos(a) * rr + J(), cy - r * 0.05 + Math.sin(a) * rr * 0.85 + J()]); }
  s += `<path d="${pathOf(sw)}" fill="none" stroke="${P.ink}" stroke-width="${f2(w)}" stroke-linecap="round"/>`;
  for (let i = 0; i < 5; i++) {
    const a0 = ph + i * 1.257, a1 = a0 + 1.5, rr = r * (0.55 + (i % 2) * 0.12), arc = [];
    for (let j = 0; j <= 8; j++) { const t = j / 8, a = a0 + (a1 - a0) * t, bulge = 1 + Math.sin(t * Math.PI) * 0.12; arc.push([cx + Math.cos(a) * rr * bulge + J(), cy + Math.sin(a) * rr * bulge * 0.88 + J()]); }
    s += `<path d="${pathOf(arc)}" fill="none" stroke="${P.ink}" stroke-width="${f2(w * 0.9)}" stroke-linecap="round"/>`;
  }
  const edge = [], bumps = 6 + Math.floor(rnd() * 2);
  for (let i = 0; i <= 48; i++) { const a = ph + i / 48 * Math.PI * 2, kk = 0.94 + 0.08 * Math.abs(Math.sin(a * bumps / 2)); edge.push([cx + Math.cos(a) * r * kk + J(), cy + Math.sin(a) * r * kk * 0.9 + J()]); }
  s += `<path d="${pathOf(edge, true)}" fill="none" stroke="${P.ink}" stroke-width="${f2(w)}" stroke-linejoin="round" opacity=".9"/>`;
  return s;
}
function leaf(x, y, len, ang, P, rnd) {
  const w = len * (0.32 + rnd() * 0.1), ca = Math.cos(ang), sa = Math.sin(ang);
  const tip = [x + ca * len, y + sa * len], nx = -sa, ny = ca;
  const c1 = [x + ca * len * 0.5 + nx * w, y + sa * len * 0.5 + ny * w], c2 = [x + ca * len * 0.5 - nx * w, y + sa * len * 0.5 - ny * w];
  const d = `M${f2(x)} ${f2(y)} Q${f2(c1[0])} ${f2(c1[1])} ${f2(tip[0])} ${f2(tip[1])} Q${f2(c2[0])} ${f2(c2[1])} ${f2(x)} ${f2(y)}Z`;
  return `<path d="${d}" fill="${P.leaf}" filter="url(#gc-wash)"/><path d="${d}" fill="none" stroke="${P.leafInk}" stroke-width="1" filter="url(#gc-ink)"/><path d="M${f2(x)} ${f2(y)} L${f2(x + ca * len * 0.85)} ${f2(y + sa * len * 0.85)}" stroke="${P.leafInk}" stroke-width=".8" opacity=".8"/>`;
}
function sparkle(x, y, s, color, cls = '') {
  const k = s * 0.2;
  return `<path class="${cls}" d="M${f2(x)} ${f2(y - s)} Q${f2(x + k)} ${f2(y - k)} ${f2(x + s)} ${f2(y)} Q${f2(x + k)} ${f2(y + k)} ${f2(x)} ${f2(y + s)} Q${f2(x - k)} ${f2(y + k)} ${f2(x - s)} ${f2(y)} Q${f2(x - k)} ${f2(y - k)} ${f2(x)} ${f2(y - s)}Z" fill="${color}"/>`;
}
function ribbonPath(d, P, w = 7) { // an outlined ribbon: ink edge, pale body, a lighter crease
  return `<path d="${d}" fill="none" stroke="${P.ribbonInk}" stroke-width="${w + 1.6}" stroke-linecap="round" stroke-linejoin="round" filter="url(#gc-ink)"/>` +
    `<path d="${d}" fill="none" stroke="${P.ribbon}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="${w * 0.22}" stroke-linecap="round" opacity=".55"/>`;
}
function bow(x, y, s, P) {
  const L = `M${x} ${y} C${x - s * 1.1} ${y - s * 0.9} ${x - s * 1.5} ${y + s * 0.2} ${x - s * 0.2} ${y + s * 0.15} Z`;
  const R = `M${x} ${y} C${x + s * 1.1} ${y - s * 0.9} ${x + s * 1.5} ${y + s * 0.2} ${x + s * 0.2} ${y + s * 0.15} Z`;
  const tails = `M${x - 2} ${y + 3} C${x - s * 0.4} ${y + s * 0.8} ${x - s * 0.9} ${y + s * 1.1} ${x - s * 0.8} ${y + s * 1.6}M${x + 2} ${y + 3} C${x + s * 0.5} ${y + s * 0.7} ${x + s * 0.7} ${y + s * 1.2} ${x + s * 1.0} ${y + s * 1.5}`;
  return ribbonPath(tails, P, 5) +
    `<path d="${L}" fill="${P.ribbon}" stroke="${P.ribbonInk}" stroke-width="1.4" filter="url(#gc-ink)"/><path d="${R}" fill="${P.ribbon}" stroke="${P.ribbonInk}" stroke-width="1.4" filter="url(#gc-ink)"/>` +
    `<ellipse cx="${x}" cy="${y + 1}" rx="${s * 0.22}" ry="${s * 0.2}" fill="${P.ribbon}" stroke="${P.ribbonInk}" stroke-width="1.4"/>`;
}
const svg = (vw, vh, body, cls = '') => `<svg class="${cls}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;

/* ------------------------------------------------------------------ the parts of the card */
function backArt(P, rnd) { // 300 x 354: paper, a ribbon frame with a bow, roses at the bow, foil sparkles
  let s = `<defs><radialGradient id="gcb" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="${P.paper}"/><stop offset=".75" stop-color="${P.paper}"/><stop offset="1" stop-color="${P.paper2}"/></radialGradient></defs>`;
  s += `<rect width="300" height="354" fill="url(#gcb)"/><rect width="300" height="354" fill="url(#gc-grain)" opacity=".5"/>`;
  const wv = (a, b) => a + (rnd() - 0.5) * b;
  const frame = `M150 26 C${wv(90, 8)} 18 ${wv(40, 6)} 30 26 ${wv(70, 8)} C14 ${wv(130, 10)} ${wv(30, 8)} ${wv(200, 14)} 20 ${wv(250, 10)} C12 300 28 330 ${wv(70, 8)} 334 M150 26 C${wv(210, 8)} 18 ${wv(260, 6)} 30 274 ${wv(70, 8)} C286 ${wv(130, 10)} ${wv(270, 8)} ${wv(200, 14)} 280 ${wv(250, 10)} C288 300 272 330 ${wv(230, 8)} 334`;
  s += ribbonPath(frame, P, 6);
  s += bow(150, 28, 20, P);
  s += rose(118, 30, 9, P, rnd) + rose(184, 31, 8, P, rnd) + leaf(104, 34, 13, 2.6, P, rnd) + leaf(196, 35, 12, 0.5, P, rnd);
  for (let i = 0; i < 34; i++) {
    const x = 24 + rnd() * 252, y = 46 + rnd() * 280;
    if (x > 50 && x < 250 && y > 80) { if (rnd() < 0.8) continue; }
    s += rnd() < 0.5 ? sparkle(x, y, 2.5 + rnd() * 5, rnd() < 0.6 ? P.gold : P.ink, 'tw') : `<circle class="tw" cx="${f2(x)}" cy="${f2(y)}" r="${f2(0.7 + rnd() * 1.1)}" fill="${P.gold}"/>`;
  }
  // loose ribbon curls at the foot of the frame
  s += ribbonPath(`M70 334 C52 346 38 330 50 322 C62 314 66 338 44 346`, P, 4) + ribbonPath(`M230 334 C248 346 262 330 250 322 C238 314 234 338 256 346`, P, 4);
  return s;
}
function coverArt(P, rnd, motif, seed) { // the outside: deckled paper, a ribbon band held by a wax seal
  let s = `<rect width="300" height="354" fill="${P.paper2}"/><rect width="300" height="354" fill="url(#gc-grain)" opacity=".6"/>`;
  s += `<rect x="12" y="12" width="276" height="330" fill="none" stroke="${P.ribbonInk}" stroke-width="1" stroke-dasharray="1 5" stroke-linecap="round" opacity=".7"/>`;
  s += ribbonPath('M-4 168 C70 160 230 176 304 166', P, 13);
  // ribbon tails tucked under the seal
  s += ribbonPath('M146 176 C128 204 112 222 96 246', P, 9) + ribbonPath('M154 176 C170 206 186 226 204 244', P, 9);
  s += rose(36, 40, 9, P, rnd) + rose(52, 30, 6, P, rnd) + leaf(26, 50, 12, 2.2, P, rnd) + leaf(60, 40, 10, -0.2, P, rnd);
  s += rose(266, 318, 9, P, rnd) + rose(250, 328, 6, P, rnd) + leaf(276, 306, 12, -1.0, P, rnd) + leaf(240, 318, 10, 3.0, P, rnd);
  for (let i = 0; i < 12; i++) { const x = 30 + rnd() * 240, y = 30 + rnd() * 110; s += sparkle(x, y, 2.5 + rnd() * 5, i % 3 ? P.gold : P.ink, 'tw'); }
  const seal = sealSVG({ color: P.wax, motif, seed }).replace('<svg ', '<svg x="98" y="116" width="104" height="104" ');
  s += `<g class="gc-seal">${seal}</g>`;
  return s;
}
function floorArt(P, rnd) { // 300 x 354, seen from above: paper, a border, a small garland at the front edge
  let s = `<rect width="300" height="354" fill="${P.floor}"/><rect width="300" height="354" fill="url(#gc-grain)" opacity=".55"/>`;
  s += `<rect x="10" y="8" width="280" height="336" rx="3" fill="none" stroke="${P.ribbonInk}" stroke-width=".9" opacity=".55"/>`;
  for (let i = 0; i < 7; i++) { const x = 34 + i * 39 + (rnd() - 0.5) * 8; s += rose(x, 328 + (rnd() - 0.5) * 5, 6, P, rnd) + leaf(x + 6, 330, 9, 0.3, P, rnd); }
  for (let i = 0; i < 9; i++) { const x = 30 + rnd() * 240, y = 120 + rnd() * 170, a = rnd() * 360, sz = 4 + rnd() * 3; s += `<path transform="translate(${f2(x)} ${f2(y)}) rotate(${f2(a)})" d="M0 ${-sz} C${sz * 0.9} ${-sz * 0.2} ${sz * 0.6} ${sz} 0 ${sz} C${-sz * 0.6} ${sz} ${-sz * 0.9} ${-sz * 0.2} 0 ${-sz}Z" fill="${P.petal[rnd() < 0.5 ? 0 : 1]}" opacity=".8" filter="url(#gc-wash)"/>`; }
  for (let i = 0; i < 8; i++) s += sparkle(24 + rnd() * 252, 40 + rnd() * 260, 2 + rnd() * 3, P.gold, 'tw');
  return s;
}
function archArt(P, rnd) { // 240 x 326: an arched panel with a vine border, roses at the shoulders and foot
  const W = 240, H = 326, r = 106, top = 14;
  const shape = `M${W / 2 - r} ${H - 6} L${W / 2 - r} ${top + r} A${r} ${r} 0 0 1 ${W / 2 + r} ${top + r} L${W / 2 + r} ${H - 6} Z`;
  let s = `<defs><radialGradient id="gca" cx="50%" cy="30%" r="65%"><stop offset="0" stop-color="${P.wash}" stop-opacity=".55"/><stop offset=".6" stop-color="${P.wash}" stop-opacity=".12"/><stop offset="1" stop-color="${P.paper}" stop-opacity="0"/></radialGradient></defs>`;
  s += `<path d="${shape}" fill="${P.paper}" stroke="${P.paper}" stroke-width="10" stroke-linejoin="round"/>`; // die-cut margin
  s += `<path d="${shape}" fill="url(#gca)"/><path d="${shape}" fill="url(#gc-grain)" opacity=".45"/>`;
  // the vine: a twisted double line along the edge, with little leaves
  const inner = r - 7, pts = [];
  for (let i = 0; i <= 60; i++) { const t = i / 60; let x, y; if (t < 0.25) { x = W / 2 - inner; y = H - 14 - (H - 14 - (top + r)) * (t / 0.25); } else if (t < 0.75) { const a = Math.PI + (t - 0.25) / 0.5 * Math.PI; x = W / 2 + Math.cos(a) * inner; y = top + r + Math.sin(a) * inner; } else { x = W / 2 + inner; y = top + r + (H - 14 - (top + r)) * ((t - 0.75) / 0.25); } pts.push([x, y]); }
  const vine = (o, ph) => pathOf(pts.map(([x, y], i) => [x + Math.sin(i * 0.9 + ph) * o, y + Math.cos(i * 0.9 + ph) * o]));
  s += `<path d="${vine(2.2, 0)}" fill="none" stroke="${P.leafInk}" stroke-width="1.6" filter="url(#gc-ink)"/><path d="${vine(2.2, Math.PI)}" fill="none" stroke="${P.leaf}" stroke-width="1.4" filter="url(#gc-ink)"/>`;
  for (let i = 2; i < 60; i += 4) { const [x, y] = pts[i], [nx, ny] = pts[i + 1]; const ang = Math.atan2(ny - y, nx - x) + (i % 8 ? 0.9 : -0.9) + Math.PI * (i % 8 ? 0 : 1); s += leaf(x, y, 7 + rnd() * 3, ang, P, rnd); }
  for (let i = 4; i < 58; i += 7) { const [x, y] = pts[i]; s += `<circle cx="${f2(x + 4)}" cy="${f2(y - 2)}" r="1.6" fill="${P.petal[2]}"/>`; }
  s += rose(W / 2 - r + 12, top + 46, 13, P, rnd) + rose(W / 2 - r + 28, top + 26, 9, P, rnd) + leaf(W / 2 - r + 2, top + 56, 15, 2.2, P, rnd);
  s += rose(W / 2 + r - 12, top + 46, 13, P, rnd) + rose(W / 2 + r - 28, top + 26, 9, P, rnd) + leaf(W / 2 + r - 2, top + 56, 15, 0.9, P, rnd);
  s += `<path d="M${W / 2 - 10} ${top + 2} C${W / 2 - 18} ${top - 10} ${W / 2 + 18} ${top - 10} ${W / 2 + 10} ${top + 2}" fill="none" stroke="${P.leafInk}" stroke-width="1.6" filter="url(#gc-ink)"/>`;
  for (let i = 0; i < 6; i++) s += sparkle(40 + rnd() * 160, 70 + rnd() * 200, 2 + rnd() * 3, P.gold, 'tw');
  return s;
}
function clusterArt(P, rnd, flip) { // 130 x 110: a die-cut bouquet, roses in a mound, leaves fanning out
  const jit = (v, a) => v + (rnd() - 0.5) * a;
  const roses = [[jit(28, 6), jit(80, 4), jit(17, 3)], [jit(62, 6), jit(84, 4), jit(19, 3)], [jit(98, 6), jit(80, 4), jit(16, 3)],
    [jit(44, 6), jit(56, 4), jit(16, 3)], [jit(80, 6), jit(55, 4), jit(17, 3)], [jit(62, 6), jit(31, 4), jit(13, 2)]];
  if (rnd() < 0.6) roses.push([jit(30, 4), jit(40, 4), 9]);
  if (rnd() < 0.6) roses.push([jit(100, 4), jit(38, 4), 9]);
  const leaves = [];
  for (let i = 0; i < 9; i++) { const a = Math.PI * (1.05 + i / 8 * 0.9) + (rnd() - 0.5) * 0.3, R0 = 30 + rnd() * 10; leaves.push([65 + Math.cos(a) * R0, 66 + Math.sin(a) * R0 * 0.9, 13 + rnd() * 8, a]); }
  leaves.push([12, 92, 14, Math.PI * 0.95], [118, 92, 14, 0.05]);
  let cut = '';
  for (const [x, y, r] of roses) cut += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r + 4.5)}"/>`;
  for (const [x, y, l, a] of leaves) cut += `<circle cx="${f2(x + Math.cos(a) * l * 0.55)}" cy="${f2(y + Math.sin(a) * l * 0.55)}" r="${f2(l * 0.42 + 3.5)}"/>`;
  cut += `<rect x="45" y="92" width="40" height="18" rx="4"/>`;
  let s = `<g fill="${P.paper}" filter="url(#gc-wash)">${cut}</g><g fill="${P.paper}">${cut}</g>`;
  for (const [x, y, l, a] of leaves) s += leaf(x, y, l, a, P, rnd);
  roses.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r] of roses) s += rose(x, y, r, P, rnd);
  for (let i = 0; i < 6; i++) s += `<circle cx="${f2(14 + rnd() * 102)}" cy="${f2(22 + rnd() * 70)}" r="${f2(1.3 + rnd())}" fill="${P.petal[2]}" stroke="${P.ink}" stroke-width=".5"/>`;
  s += sparkle(jit(18, 6), jit(26, 6), 3.5, P.gold, 'tw') + sparkle(jit(112, 6), jit(24, 6), 3, P.gold, 'tw');
  return flip ? `<g transform="translate(130 0) scale(-1 1)">${s}</g>` : s;
}
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <filter id="gc-ink" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation=".15"/></filter>
  <filter id="gc-wash" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".7"/></filter>
  <pattern id="gc-grain" width="120" height="120" patternUnits="userSpaceOnUse"><filter id="gc-gr"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .32  0 0 0 0 .3  0 0 0 .09 0"/></filter><rect width="120" height="120" filter="url(#gc-gr)"/></pattern>
</defs></svg>`;

/* ------------------------------------------------------------------ the card */
/**
 * items: [{ text, from, to, side: 'human'|'ai', sign }] — one card each, opened in turn.
 * opts: { seed, heading, tapHint, nextLabel, doneLabel, lang, onClose }
 */
export function openGreetingCards(items, opts = {}) {
  preloadCardFonts();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.className = 'gc-overlay'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', opts.heading || '');
  root.innerHTML = DEFS;
  document.body.append(root);
  let index = 0, card = null, raf = 0, closed = false;
  const cam = { cx: -64, ry: 0, y: 0, tx: -64, tr: 0, ty: 0 }; // camera: tilt, turn, lift (deg / px)
  const pointer = { on: false, x: 0, y: 0, t: 0 };

  const tick = now => {
    const t = now / 1000;
    if (!pointer.on && card?.open) cam.tr = Math.sin(t * 0.45) * 7;
    const k = 0.075;
    cam.cx += (cam.tx - cam.cx) * k; cam.ry += (cam.tr - cam.ry) * k; cam.y += (cam.ty - cam.y) * k;
    if (card) card.camEl.style.transform = `translateY(${cam.y.toFixed(1)}px) rotateX(${cam.cx.toFixed(2)}deg) rotateY(${cam.ry.toFixed(2)}deg)`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  root.addEventListener('pointermove', e => {
    if (!card?.open) return;
    pointer.on = true; clearTimeout(pointer.t); pointer.t = setTimeout(() => { pointer.on = false; }, 1600);
    const r = root.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
    cam.tr = nx * 30; cam.tx = card.openTilt - ny * 12;
  });

  function build(item) {
    const P = PALETTES[item.side === 'ai' ? 'lilac' : 'rose'];
    const rnd = rngFor(String(opts.seed || 'card'), item.side + index);
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || 9999), vh = window.innerHeight;
    const W = Math.round(Math.min(vw * 0.78, 360, vh * 0.52 / 1.18)), H = Math.round(W * 1.18);
    const el = document.createElement('div');
    el.className = 'gc';
    el.style.cssText = `--W:${W}px;--H:${H}px;--ink:${P.text};--gold:${P.gold};--paper:${P.paper}`;
    const shadows = [];
    const layer = (cls, w, h, x, z, art, vbw, vbh, delay) => {
      shadows.push(`<i class="gc-shadow" style="left:${x - w * 0.45 + W / 2}px;top:${z - 6}px;width:${w * 0.9}px;--d:${delay}s"></i>`);
      return `<div class="gc-layer ${cls}" style="width:${w}px;height:${h}px;left:${x - w / 2}px;top:${-h}px;--z:${z}px;--d:${delay}s">${svg(vbw, vbh, art)}</div>`;
    };
    const aw = Math.round(W * 0.8), ah = Math.round(H * 0.8);
    const layersHtml = [
      layer('gc-arch', aw, ah, 0, Math.round(H * 0.16), archArt(P, rnd), 240, 326, 0.25),
      layer('gc-cluster', Math.round(W * 0.36), Math.round(W * 0.31), Math.round(-W * 0.3), Math.round(H * 0.5), clusterArt(P, rnd, false), 130, 110, 0.45),
      layer('gc-cluster', Math.round(W * 0.34), Math.round(W * 0.29), Math.round(W * 0.31), Math.round(H * 0.56), clusterArt(P, rnd, true), 130, 110, 0.55)
    ].join('');
    el.innerHTML = `
      <div class="gc-cam"><div class="gc-scene">
        <div class="gc-floor" style="width:${W}px;height:${H}px;left:${-W / 2}px">${svg(300, 354, floorArt(P, rnd))}${shadows.join('')}</div>
        <div class="gc-back" style="width:${W}px;height:${H}px;left:${-W / 2}px;top:${-H}px">
          <div class="gc-face gc-inside">${svg(300, 354, backArt(P, rnd))}</div>
          <div class="gc-face gc-cover">${svg(300, 354, coverArt(P, rnd, item.motif || 'rose', String(opts.seed || 'card') + index))}<div class="gc-cover-text"><span class="script">${opts.lang === 'zh' ? 'for you' : 'for you'}</span><b>${esc(item.coverLine || '')}</b></div></div>
        </div>
        ${layersHtml}
      </div></div>
      <div class="gc-burst" aria-hidden="true"></div>`;
    // the words, written on the arch
    const arch = el.querySelector('.gc-arch');
    const words = document.createElement('div');
    words.className = 'gc-words';
    words.style.fontFamily = CARD_FONT;
    words.innerHTML = `<div class="gc-head"><span class="script">${esc(opts.lang === 'zh' ? 'a sealed line' : 'a sealed line')}</span>${esc(opts.heading || '')}</div>${item.to ? `<div class="gc-to">${esc(item.to)}</div>` : ''}<p class="gc-body"></p><div class="gc-sign">${esc(item.sign || '')}</div>`;
    arch.append(words);
    const body = words.querySelector('.gc-body');
    if (Array.from(item.text).length <= 24) body.classList.add('short');
    for (const ch of Array.from(item.text)) { const s = document.createElement('span'); s.textContent = ch; body.append(s); }
    return { el, P, camEl: el.querySelector('.gc-cam'), words, body, open: false, openTilt: -13, lift: -Math.round(H * 0.8) };
  }

  function show(i) {
    const item = items[i];
    card = build(item);
    const hint = document.createElement('button');
    hint.type = 'button'; hint.className = 'gc-hint'; hint.textContent = opts.tapHint || 'Tap to open';
    const bar = document.createElement('div'); bar.className = 'gc-bar';
    const counter = items.length > 1 ? `<span class="gc-count">${i + 1} / ${items.length}</span>` : '';
    bar.innerHTML = counter;
    const next = document.createElement('button'); next.type = 'button'; next.className = 'btn primary gc-next';
    next.textContent = i < items.length - 1 ? (opts.nextLabel || 'Next') : (opts.doneLabel || 'Done');
    next.addEventListener('click', () => fold(() => (i < items.length - 1 ? show(i + 1) : finish())));
    bar.append(next);
    root.querySelectorAll('.gc, .gc-hint, .gc-bar').forEach(n => n.remove());
    root.append(card.el, hint, bar);
    // closed: seen from above, lying on the table
    cam.cx = cam.tx = -66; cam.ry = cam.tr = 0;
    cam.y = cam.ty = card.lift;
    const fit = () => fitText(card);
    const open = () => {
      if (card.open) return;
      card.open = true; hint.remove();
      navigator.vibrate?.(12);
      card.el.classList.add('open');
      cam.tx = card.openTilt; cam.ty = 0;
      burst(card.el.querySelector('.gc-burst'), card.P.gold);
      const write = async () => {
        // wait for every glyph on the card (the Chinese font arrives in pieces), then fit the words to the arch
        const all = [item.text, item.to, item.sign, opts.heading].join('');
        await Promise.race([Promise.all([document.fonts?.load?.(`18px "Xiaolai SC"`, all), document.fonts?.load?.(`24px "Pinyon Script"`, 'a sealed line')]), new Promise(r => setTimeout(r, 1800))]).catch(() => {});
        fit();
        setTimeout(fit, 1200); // and once more, in case a late piece of the font changed the layout
        const spans = [...card.body.children], step = Math.min(70, 2600 / Math.max(1, spans.length));
        spans.forEach((s, k) => { s.style.animationDelay = (reduce ? 0 : k * step) + 'ms'; });
        card.words.classList.add('writing');
        setTimeout(() => { bar.classList.add('on'); }, reduce ? 0 : Math.min(2600, spans.length * step) + 500);
      };
      setTimeout(write, reduce ? 0 : 1300);
    };
    card.el.addEventListener('click', open);
    hint.addEventListener('click', open);
    if (reduce) open();
  }
  function fold(then) {
    if (!card) return then();
    card.el.classList.remove('open'); card.el.classList.add('closing'); card.open = false;
    cam.tx = -66; cam.tr = 0; cam.ty = card.lift;
    root.querySelector('.gc-bar')?.classList.remove('on');
    setTimeout(then, reduce ? 0 : 900);
  }
  function finish() {
    if (closed) return; closed = true;
    root.classList.add('out');
    setTimeout(() => { cancelAnimationFrame(raf); root.remove(); opts.onClose?.(); }, 350);
  }
  root.addEventListener('keydown', e => { if (e.key === 'Escape') fold(finish); });
  show(0);
  return { close: () => fold(finish) };
}

function fitText(card) {
  const box = card.words, body = card.body;
  let size = body.classList.contains('short') ? 20 : 18;
  body.style.fontSize = size + 'px';
  while (size > 12.5 && box.scrollHeight > box.clientHeight + 1) { size -= 0.5; body.style.fontSize = size + 'px'; }
  if (box.scrollHeight > box.clientHeight + 1) box.classList.add('scroll');
}
function burst(host, gold) {
  if (!host) return;
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 120;
    p.style.cssText = `--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 60}px;--s:${0.5 + Math.random()};--delay:${0.5 + Math.random() * 0.5}s;background:${i % 3 ? gold : '#FFFFFF'}`;
    host.append(p);
  }
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
