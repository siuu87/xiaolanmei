// Codec — the text formats an AI can write by hand, and the compact formats the browser writes.
//
// AI half ("tilde code"), designed to be typed by a model that cannot run code:
//   ai~planet1~R=7Q3K~seal=K4D2PX~half=sky~sky=6~moon=2~air=4~visitor=1~wonder=3~word=Hollow~line=Rain_falls_up~why=...~wish=...~from=Orin
// Only URL-safe characters are needed, so it can be pasted straight after "#" in a link.
// "_" means a space in text values. "~" separates fields and must not appear inside values.
//
// Browser-written values (the human's own sealed half, finished keepsakes) are base64url JSON.

export const SEP = '~';

/** Safe percent-decoding: chat apps sometimes encode a pasted link, sometimes not. */
export function softDecode(s) {
  s = String(s ?? '');
  try { return decodeURIComponent(s.replace(/%(?![0-9a-fA-F]{2})/g, '%25')); } catch { return s; }
}

/** Text value as an AI writes it -> display text. */
export function readText(v) {
  return softDecode(v).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Display text -> a value that is safe inside a tilde code. */
export function writeText(t) {
  return String(t ?? '')
    .replace(/[~#%\n\r\t]/g, ' ')
    .trim()
    .replace(/\s+/g, '_');
}

/** Parse "role~recipe~k=v~k=v" into {role, recipe, fields}. Unknown keys are kept. */
export function parseTilde(raw) {
  let s = softDecode(String(raw ?? '').trim());
  // Accept a whole link, a bare hash, or the code itself.
  const hashAt = s.indexOf('#');
  if (hashAt >= 0) s = s.slice(hashAt + 1);
  s = s.replace(/^[\s<(\[]+|[\s>)\].,!?]+$/g, '');
  const parts = s.split(SEP).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const [role, recipe, ...rest] = parts;
  const fields = {};
  for (const p of rest) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    const v = p.slice(eq + 1).trim();
    if (k && !(k in fields)) fields[k] = v; // first value wins: a code cannot be "edited" by appending
  }
  return { role: role.toLowerCase(), recipe: recipe.toLowerCase(), fields };
}

export function buildTilde(role, recipe, fields) {
  const out = [role, recipe];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue;
    out.push(k + '=' + v);
  }
  return out.join(SEP);
}

/* ---------- base64url JSON (works in browsers and Node 18+) ---------- */

export function toB64url(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s) {
  try {
    const b = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '==='.slice((b.length + 3) % 4));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}

/* ---------- hashing, ids, seeded randomness ---------- */

/** cyrb53 — small, fast, deterministic. Not cryptographic; mystery, not security. */
export function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// Crockford-ish alphabet without look-alikes (no 0/O, 1/I/L, U).
const ALPHA = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function toCode(n, len) {
  let s = '';
  for (let i = 0; i < len; i++) { s += ALPHA[n % ALPHA.length]; n = Math.floor(n / ALPHA.length); }
  return s;
}

export function randomCode(len = 4) {
  const buf = new Uint32Array(len);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, x => ALPHA[x % ALPHA.length]).join('');
}

/** Normalise a round id or seal someone typed (case, stray punctuation). */
export function normCode(s) {
  return String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(...parts) {
  return mulberry32(hash53(parts.join('|')) >>> 0);
}

/** Canonical JSON (sorted keys) so a seal fingerprint is stable. */
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
