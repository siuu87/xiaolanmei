// Wax seals, drawn as SVG in an illustrated (not photographic) style:
// an irregular poured edge with a little thickness, a raised rim, a pressed-in centre,
// an embossed motif (light catches its upper-left edges, shadow sits lower-right), and a soft gloss.
import { rngFor } from '../engine/codec.js';

let uid = 0;
const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const f = n => n.toFixed(2);

/* motifs, drawn in a 100 x 100 box around (50, 50), within a radius of about 24 */
// class="line": a raised stroke (a stem); class="cut": an engraved groove on top of a raised shape
const MOTIFS = {
  rose: `<path d="M38.5 36.5c1.5-5.5 6.5-8.5 11.5-8.5s10 3 11.5 8.5c1 4.5-.5 9-4 11.5-2.2 1.6-4.8 2.3-7.5 2.3s-5.3-.7-7.5-2.3c-3.5-2.5-5-7-4-11.5z"/>
    <path class="cut" d="M50 33.5c-2.6 0-4.4 1.8-4.4 4s1.9 3.6 4.2 3.6 4-1.5 4-3.5c0-1.6-1.2-2.7-2.6-2.7M42 37.5c.5 5 3.8 8.4 8 8.4s7.5-3.4 8-8.4M45.5 30.5c-2 2.5-3 5.5-2.6 8.5M54.5 30.5c2 2.5 3 5.5 2.6 8.5M40 44c3 3.2 6.5 4.8 10 4.8s7-1.6 10-4.8"/>
    <path class="line" d="M50 50.5c.4 6.5-.3 13-1.5 20"/>
    <path d="M49.4 58c-3.5-5-10.5-6.5-14.5-4 3.5 4 9 5.8 14.5 4zM49 64c3.6-5.4 10.6-7 14.6-4.6-3.6 4.2-9.2 6.2-14.6 4.6z"/>
    <path class="cut" d="M48 57.5c-3.5-1.5-7.5-2.8-11-3.4M50 63.5c3.4-1.8 7.4-3.4 11-4"/>`,
  tulips: `<path d="M35.5 36c-2.5 3.5-2 9.5 1.2 12 2.4 1.9 6 1.6 8-.6 2.6-3 2.4-8.6-.4-11.4l-1.6 3.4-2.4-4.6-2.4 4.6z"/><path d="M56 31.5c-2.5 3.5-2 9.5 1.2 12 2.4 1.9 6 1.6 8-.6 2.6-3 2.4-8.6-.4-11.4l-1.6 3.4-2.4-4.6-2.4 4.6z"/><path d="M45.5 42c-2.5 3.5-2 9.5 1.2 12 2.4 1.9 6 1.6 8-.6 2.6-3 2.4-8.6-.4-11.4l-1.6 3.4-2.4-4.6-2.4 4.6z"/>
    <path class="cut" d="M40.7 41v6.5M61.2 36.5v6.5M50.7 47v6.5"/>
    <path class="line" d="M41 49c1.8 8 5 14.5 9 20.5M61.5 44.5c-1.6 9-4.6 16.6-10 25M50.7 55.5v14"/>
    <path d="M50.4 67c-6-2.6-10-8.4-11.4-13.6 5.2 1.6 9.2 6.8 11.4 13.6zM51.6 66.6c5-4 8-9.8 8.2-14-4.2 3-7.2 8-8.2 14z"/>`,
  bow: `<path d="M50 47.5c-5-8.5-15.5-13-19.5-8.5-3.5 5 4.5 11.5 19.5 8.5zM50 47.5c5-8.5 15.5-13 19.5-8.5 3.5 5-4.5 11.5-19.5 8.5z"/>
    <path d="M47.6 50.5c-3 6.5-7 12.5-11.4 17.5l5.6 1.2 7.6-18zM52.4 50.5c3 6.5 7 12.5 11.4 17.5l-5.6 1.2-7.6-18z"/><ellipse cx="50" cy="48.4" rx="4.2" ry="3.8"/>
    <path class="cut" d="M34.5 41.5c4.5 1 8.5 3 12 5.5M65.5 41.5c-4.5 1-8.5 3-12 5.5M38 45c3 1 6 1.8 9 2M62 45c-3 1-6 1.8-9 2M46.5 54c-1.5 3.6-3.4 7-5.8 10.4M53.5 54c1.5 3.6 3.4 7 5.8 10.4"/>`,
  moon: `<path d="M56 29.5a14.5 14.5 0 1 0 8.6 25.4 11.5 11.5 0 1 1-8.6-25.4z"/>
    <path class="cut" d="M51 34c-3.5 2.5-5.5 7-5 11.5"/>
    <path d="M29.5 62.5c0-4 4-6.2 7.2-4.2 1.2-4.4 7.4-5.2 9.4-1 3-1 6.4 1 6.4 4.2v1h-23zM57 66.5c0-3 3.2-5 6-3.2 1-3.4 6.4-4.2 8-.2 2.2 0 4 1.4 4 3.4v.6H57z"/>
    <path class="cut" d="M36 61c1.5-1.6 3.6-2 5.4-1.2M62.5 65c1-1.2 2.6-1.6 4-1"/>
    <path class="line" d="M27 70c8-2 14 1 22-1M53 73.5c6.5-1.4 12.5 1 21-1"/>
    <path d="M38 35l1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1zM70.5 39l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8zM66 28l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>`,
  butterfly: `<path d="M49 49.5c-4-10-14.5-15.5-18.5-11.5-3.4 4.4 3.4 12.4 18.5 11.5zM51 49.5c4-10 14.5-15.5 18.5-11.5 3.4 4.4-3.4 12.4-18.5 11.5zM49 52c-3 7.4-10.4 11.6-13.6 8.4-2.2-3.2 3.2-8.6 13.6-8.4zM51 52c3 7.4 10.4 11.6 13.6 8.4 2.2-3.2-3.2-8.6-13.6-8.4z"/>
    <path class="cut" d="M47 47c-4-3-9-5.4-13-5.6M53 47c4-3 9-5.4 13-5.6M46.5 53.5c-2.6 2-5.2 3.6-8 4.2M53.5 53.5c2.6 2 5.2 3.6 8 4.2"/>
    <path d="M50 41.5c1.6 0 2.2 3.4 2.2 9.5s-.6 10.5-2.2 10.5-2.2-4.4-2.2-10.5.6-9.5 2.2-9.5z"/>
    <path class="line" d="M49 42c-2-4-4.2-6.2-6.6-7.2M51 42c2-4 4.2-6.2 6.6-7.2"/>`,
  star: `<path d="M50 29.5c1.6 11.4 5.6 15.4 17 17.2-11.4 1.8-15.4 5.8-17 17.2-1.6-11.4-5.6-15.4-17-17.2 11.4-1.8 15.4-5.8 17-17.2z"/>
    <path class="cut" d="M50 36v21M39.5 46.7h21"/><circle cx="34" cy="36" r="1.8"/><circle cx="67" cy="63" r="1.6"/><circle cx="68" cy="34" r="1.2"/>`
};

/**
 * sealSVG({ color, motif, text, sub, seed, gold }) -> an <svg> string (viewBox 0 0 100 100, drawn to fit its box).
 * `text` (e.g. a fingerprint) is pressed into the centre instead of a motif; `sub` is a small line under it.
 */
export function sealSVG({ color = '#C9707F', motif = 'rose', text = '', sub = '', seed = 'seal', gold = false, font = '' } = {}) {
  const id = 'ws' + (++uid);
  const rnd = rngFor(String(seed), 'seal');
  const light = mix(color, '#FFFFFF', 0.42), lighter = mix(color, '#FFFFFF', 0.68), dark = mix(color, '#2A1018', 0.32), darker = mix(color, '#2A1018', 0.5);
  // the poured edge: a soft, uneven blob
  const lobes = 6 + Math.floor(rnd() * 3), ph = rnd() * 6, pts = [];
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2;
    const r = 44 + 2.4 * Math.sin(a * lobes + ph) + 1.2 * Math.sin(a * (lobes + 3) + ph * 2) + (rnd() - 0.5) * 0.8;
    pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; d += ` Q${f(p[0])} ${f(p[1])} ${f((p[0] + q[0]) / 2)} ${f((p[1] + q[1]) / 2)}`; }
  d += 'Z';
  const R = 31.5; // the pressed disc
  const relief = motif && !text ? (MOTIFS[motif] || MOTIFS.star) : '';
  const solid = relief.replace(/<path class="cut"[^>]*\/>/g, '');
  const cuts = (relief.match(/<path class="cut"[^>]*\/>/g) || []).join('');
  // the raised motif: its shadow (lower right), its lit edge (upper left), then the motif itself
  const pressed = (fill, dx, dy, op, sw) => `<g transform="translate(${dx} ${dy})" opacity="${op}" fill="${fill}" stroke="${fill}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${solid.replace(/class="line"/g, `fill="none" stroke-width="${sw + 1.5}"`)}</g>`;
  // engraved grooves: dark inside, a hair of light on their lower edge
  const grooves = cuts ? `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${cuts.replace(/class="cut"/g, `stroke="${lighter}" stroke-width="1.1" opacity=".7" transform="translate(.35 .45)"`)}${cuts.replace(/class="cut"/g, `stroke="${dark}" stroke-width="1.05" opacity=".75"`)}</g>` : '';
  const motifFill = gold ? '#E2C07A' : light;
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="${id}b" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
    <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighter}"/><stop offset=".5" stop-color="${color}" stop-opacity=".2"/><stop offset="1" stop-color="${darker}"/></linearGradient>
    <linearGradient id="${id}i" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${darker}"/><stop offset=".55" stop-color="${color}" stop-opacity="0"/><stop offset="1" stop-color="${lighter}"/></linearGradient>
    <radialGradient id="${id}d" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="${mix(color, '#FFFFFF', 0.12)}"/><stop offset="1" stop-color="${mix(color, '#2A1018', 0.12)}"/></radialGradient>
    <pattern id="${id}t" width="17" height="17" patternUnits="userSpaceOnUse">${Array.from({ length: 14 }, (_, i) => `<circle cx="${f(rnd() * 17)}" cy="${f(rnd() * 17)}" r="${f(0.3 + rnd() * 0.4)}" fill="${i % 2 ? '#FFFFFF' : darker}" opacity="${i % 2 ? 0.2 : 0.13}"/>`).join('')}</pattern>
  </defs>
  <path d="${d}" fill="${darker}" transform="translate(1.2 2.4)" opacity=".55"/>
  <path d="${d}" fill="${dark}" transform="translate(.4 1.2)"/>
  <path d="${d}" fill="url(#${id}b)"/>
  <circle cx="50" cy="50" r="${R + 5.5}" fill="none" stroke="url(#${id}r)" stroke-width="6.5"/>
  <circle cx="50" cy="50" r="${R}" fill="url(#${id}d)"/>
  <circle cx="50" cy="50" r="${R}" fill="url(#${id}t)"/>
  <circle cx="50" cy="50" r="${R}" fill="none" stroke="url(#${id}i)" stroke-width="2.2"/>
  ${relief ? pressed(darker, 0.9, 1.1, 0.55, 0.8) + pressed('#FFFFFF', -0.7, -0.8, 0.55, 0.8) + pressed(motifFill, 0, 0, 1, 0.6) + grooves : ''}
  ${text ? `<text x="50" y="${sub ? 50 : 54}" text-anchor="middle" font-size="11.5" font-weight="600" letter-spacing="1.6" fill="${darker}" opacity=".55" transform="translate(.6 .8)" font-family="${font || 'DM Sans, sans-serif'}">${esc(text)}</text>
    <text x="50" y="${sub ? 50 : 54}" text-anchor="middle" font-size="11.5" font-weight="600" letter-spacing="1.6" fill="${lighter}" font-family="${font || 'DM Sans, sans-serif'}">${esc(text)}</text>
    ${sub ? `<text x="50" y="63" text-anchor="middle" font-size="9.5" fill="${lighter}" opacity=".92" font-family="Caveat, cursive">${esc(sub)}</text>` : ''}
    <path d="M50 ${sub ? 30 : 33}l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="${lighter}" opacity=".85"/>` : ''}
  <path d="M22 34c4-10 13-17 24-18" fill="none" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" opacity=".5"/>
  <path d="M19.5 44c.3-2 .8-3.6 1.4-5" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" opacity=".45"/>
  <circle cx="72" cy="22" r="1.4" fill="#FFFFFF" opacity=".55"/>
  <path d="M70 84c6-3 11-8 13-14" fill="none" stroke="${darker}" stroke-width="2" stroke-linecap="round" opacity=".25"/>
</svg>`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
