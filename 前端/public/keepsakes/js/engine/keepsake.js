// Keepsake — the portable artifact of a finished round.
//
// Two forms of the same thing:
//  - the full JSON document (format "companion-keepsake", v1): archival, export, private integrations;
//  - the compact link form (#k=<base64url>): both sealed halves + names + times. The render spec is
//    recomputed from the halves with the recipe version named in it, so the link stays short.
// Either form reopens the same object: same picks, same seed, same positions.

import { toB64url, fromB64url } from './codec.js';
import { recipeByCode } from '../recipes/index.js';
import { mergeRound, PROTOCOL } from './round.js';

export const FORMAT = 'companion-keepsake';
export const VERSION = 1;

const packHalf = h => h && ({
  h: h.half, p: h.picks, c: h.chance?.length ? h.chance : undefined,
  w: h.word || undefined, l: h.line || undefined, y: h.why || undefined, x: h.wish || undefined,
  n: h.name, t: h.sealedAt, f: h.fp, s: h.salt, e: h.echoed || undefined, k: h.code || undefined
});
const unpackHalf = o => o && ({
  half: o.h, picks: o.p || {}, chance: o.c || [], word: o.w || '', line: o.l || '', why: o.y || '', wish: o.x || '',
  name: o.n, sealedAt: o.t, fp: o.f, salt: o.s, echoed: o.e || null, code: o.k || null
});

/** Round -> compact link payload. */
export function toLink(round, base = '') {
  const payload = {
    f: 1, c: round.recipe, R: round.id, o: ({ 'ai-first': 'a', solo: 's', gift: 'g' })[round.order] || 'h',
    md: ({ solo: 's', gift: 'g' })[round.mode],
    pl: round.plaque?.name || undefined, pd: round.plaque?.date || undefined,
    H: packHalf(round.human), A: packHalf(round.ai),
    m: round.theme || undefined, ct: round.createdAt, ot: round.openedAt || undefined, kt: round.keptAt || undefined
  };
  return base + '#k=' + toB64url(payload);
}

/** Compact payload (or a link containing one) -> a round in "opened" state. */
export function fromLink(raw) {
  const s = String(raw || '');
  const at = s.indexOf('k=');
  const payload = fromB64url(at >= 0 ? s.slice(at + 2).split(/[&#\s]/)[0] : s);
  if (!payload || payload.f !== 1 || !recipeByCode(payload.c) || !payload.H || !payload.A) return null;
  const human = unpackHalf(payload.H), ai = unpackHalf(payload.A);
  if (ai.code && human.fp) ai.sealMatch = ai.echoed ? ai.echoed === human.fp : null;
  return {
    id: payload.R, recipe: payload.c, humanHalf: human.half, theme: payload.m || '',
    names: { human: human.name || 'You', ai: ai.name || 'Companion' },
    mode: ({ s: 'solo', g: 'gift' })[payload.md] || 'companion',
    order: ({ a: 'ai-first', s: 'solo', g: 'gift' })[payload.o] || 'human-first',
    plaque: payload.pl || payload.pd ? { name: payload.pl || '', date: payload.pd || '' } : null,
    createdAt: payload.ct || human.sealedAt, human, ai,
    openedAt: payload.ot || ai.sealedAt, keptAt: payload.kt || null
  };
}

/** Round -> full keepsake document. `extra.display` may carry a thumbnail and notes. */
export function toKeepsake(round, extra = {}) {
  const R = recipeByCode(round.recipe);
  const spec = mergeRound(round);
  const contribution = (h, role) => ({
    name: h.name, half: h.half,
    picks: Object.fromEntries(Object.entries(h.picks).map(([slot, n]) => {
      const opt = R.option(slot, n);
      return [slot, { n, id: opt.id, name: opt.name, meaning: opt.meaning, title: R.slots[slot].title }];
    })),
    halfTitle: R.halves[h.half]?.title || h.half,
    lineLabel: R.halves[h.half]?.line?.label || '',
    leftToChance: h.chance || [],
    word: h.word, line: h.line, why: h.why, wish: h.wish,
    sealedAt: h.sealedAt, seal: h.fp,
    ...(role === 'ai' ? { code: h.code, echoedSeal: h.echoed || null } : {})
  });
  return {
    format: FORMAT,
    v: VERSION,
    id: `${round.recipe}-${round.id}-${round.human.fp}`,
    recipe: { id: R.id, version: R.version, code: R.code, title: R.title },
    mode: ['solo', 'gift'].includes(round.mode) ? round.mode : 'companion',
    title: spec.title,
    round: round.id,
    seed: round.id,
    theme: round.theme || '',
    createdAt: round.createdAt,
    openedAt: round.openedAt,
    keptAt: round.keptAt,
    participants: {
      human: { name: round.names.human, half: round.human.half },
      ai: { name: round.names.ai, half: round.ai.half }
    },
    contributions: { human: contribution(round.human, 'human'), ai: contribution(round.ai, 'ai') },
    provenance: {
      protocol: PROTOCOL,
      order: round.order,
      humanSeal: round.human.fp,
      aiEchoedSeal: round.ai.echoed || null,
      sealMatches: round.ai.sealMatch ?? null,
      note: 'Each half was sealed when it was chosen. The merge only layers sealed picks and named resonances; nothing was regenerated.'
    },
    display: {
      accent: spec.palette.bg[1],
      background: spec.palette.bg,
      dark: spec.palette.dark,
      ...(round.plaque ? { plaque: round.plaque } : {}),
      ...(extra.display || {})
    },
    render: { renderer: `${R.id}@${R.version}`, spec },
    link: toLink(round)
  };
}

/** Full keepsake document -> round (for reopening). Accepts the document or its JSON text. */
export function fromKeepsake(doc) {
  if (typeof doc === 'string') { try { doc = JSON.parse(doc); } catch { return fromLink(doc); } }
  if (!doc || doc.format !== FORMAT) return null;
  if (doc.link) { const r = fromLink(doc.link); if (r) return { ...r, keptAt: doc.keptAt || r.keptAt, plaque: r.plaque || doc.display?.plaque || null }; }
  return null;
}

export function validate(doc) {
  const errs = [];
  if (!doc || typeof doc !== 'object') return ['not an object'];
  if (doc.format !== FORMAT) errs.push('format must be ' + FORMAT);
  if (doc.v !== VERSION) errs.push('unsupported version ' + doc.v);
  if (!recipeByCode(doc.recipe?.code)) errs.push('unknown recipe');
  for (const k of ['human', 'ai']) {
    const c = doc.contributions?.[k];
    if (!c || !c.picks || !c.sealedAt) errs.push(`contributions.${k} missing picks or sealedAt`);
  }
  if (!doc.render?.spec) errs.push('render.spec missing');
  if (!fromKeepsake(doc)) errs.push('link does not reopen');
  return errs;
}
