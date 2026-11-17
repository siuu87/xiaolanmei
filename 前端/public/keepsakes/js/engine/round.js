// Round — one co-creation: human half + AI half -> merge -> reveal -> keepsake.
// Pure functions over plain objects (no DOM, no storage), so Node tests and the browser share them.
//
// Invariants:
//  - a sealed half is never edited or regenerated; a second, different AI half for the same round is refused;
//  - the human's choices never appear in anything sent to the AI before the reveal;
//  - the human seal fingerprint is shown to the AI, and the AI echoes it, so the reveal can show the
//    human half was fixed before the AI chose (light commit/reveal: mystery, not security).

import { parseTilde, buildTilde, readText, writeText, hash53, toCode, randomCode, normCode, canonical, rngFor } from './codec.js';
import { recipes, recipeByCode } from '../recipes/index.js';
import { loc } from '../recipes/loc.js';

export const PROTOCOL = 'ckp/1';

const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return [...s].slice(0, n).join(''); };

export function newRound({ recipe = 'planet1', humanHalf, theme = '', names = {}, id, mode = 'companion' } = {}) {
  const R = recipeByCode(recipe);
  if (!R) throw new Error('unknown recipe ' + recipe);
  return {
    id: id || randomCode(4),
    recipe: R.code,
    mode: ['solo', 'gift'].includes(mode) ? mode : 'companion',
    humanHalf: humanHalf || R.defaultHumanHalf,
    theme: clip(theme, 140),
    names: { human: clip(names.human || 'You', 24), ai: clip(names.ai || 'Companion', 24) },
    order: 'human-first',
    createdAt: new Date().toISOString(),
    human: null,
    ai: null,
    openedAt: null,
    keptAt: null
  };
}

/** Clean a half's draft into the canonical sealed shape (picks stored as option numbers). */
function cleanHalf(R, half, draft, { fillChance = false, seed = '' } = {}) {
  const picks = {}, chance = [], missing = [];
  for (const slot of R.slotsOf(half)) {
    let opt = R.option(slot, draft.picks?.[slot]);
    if (!opt) {
      if (!fillChance) { missing.push(slot); continue; }
      const list = R.slots[slot].options;
      opt = list[Math.floor(rngFor(seed, half, slot)() * list.length)];
      chance.push(slot);
    }
    picks[slot] = opt.n;
  }
  const T = R.text;
  return {
    half,
    picks,
    chance,
    missing,
    word: clip(draft.word, T.word.max),
    line: clip(draft.line, T.line.max),
    why: clip(draft.why, T.why.max),
    wish: clip(draft.wish, T.wish.max)
  };
}

export function fingerprint(round, sealed) {
  const body = canonical({ R: round.id, c: round.recipe, h: sealed.half, p: sealed.picks, w: sealed.word, l: sealed.line, y: sealed.why, x: sealed.wish, s: sealed.salt });
  return toCode(hash53(body), 6);
}

/** Seal the human half. Returns a new round; throws if already sealed or incomplete. */
export function sealHuman(round, draft) {
  if (round.human) throw new Error('Your half is already sealed. A sealed choice stays as it is.');
  const R = recipeByCode(round.recipe);
  const c = cleanHalf(R, round.humanHalf, draft);
  if (c.missing.length) throw new Error('Still to choose: ' + c.missing.map(s => R.slots[s].title).join(', '));
  delete c.missing;
  const sealed = { ...c, name: round.names.human, salt: randomCode(8), sealedAt: new Date().toISOString() };
  sealed.fp = fingerprint(round, sealed);
  return { ...round, human: sealed };
}

/**
 * Read an AI half from a link / tilde code. Returns {ok, half, warnings, error, roundId}.
 * Lenient on purpose: a missing or unknown pick is "left to the stars" (seeded), and said so in the reveal.
 */
export function readAiCode(raw) {
  const t = parseTilde(raw);
  if (!t || t.role !== 'ai') return { ok: false, error: 'This does not look like a companion\'s sealed half (it should start with ai~).' };
  const R = recipeByCode(t.recipe);
  if (!R) return { ok: false, error: 'Unknown game "' + t.recipe + '".' };
  const f = t.fields;
  const half = (f.half || '').toLowerCase() in R.halves ? f.half.toLowerCase() : null;
  // A gift: the companion made the whole thing (half=all), and the person only opens it.
  const gift = /^(all|both|whole|gift)$/i.test(f.half || '') || /^gift$/i.test(f.mode || '');
  const roundId = f.r ? normCode(f.r) : null;
  const echoed = f.seal ? normCode(f.seal) : null;
  const code = String(raw).trim();
  return { ok: true, recipe: R.code, half, gift, roundId, echoed, fields: f, code: code.slice(code.indexOf('ai~') >= 0 ? code.indexOf('ai~') : 0) };
}

/** Attach the AI half to a round (human-first) or start a round from it (ai-first). */
export function acceptAi(round, parsed) {
  if (!parsed?.ok) throw new Error(parsed?.error || 'Unreadable code.');
  if (round.recipe !== parsed.recipe) throw new Error('This half belongs to a different game.');
  if (parsed.roundId && parsed.roundId !== round.id) throw new Error(`This half belongs to round ${parsed.roundId}, not ${round.id}.`);
  const R = recipeByCode(round.recipe);
  const half = round.human ? R.other(round.humanHalf) : (parsed.half || R.other(round.humanHalf));
  if (round.ai) {
    if (round.ai.code === parsed.code) return round;
    throw new Error(`${round.names.ai}'s half for this round is already sealed. It is kept exactly as it was first sent.`);
  }
  const f = parsed.fields;
  const draft = { picks: {}, word: readText(f.word), line: readText(f.line), why: readText(f.why), wish: readText(f.wish) };
  for (const slot of R.slotsOf(half)) draft.picks[slot] = f[slot] != null ? readText(f[slot]) : '';
  const c = cleanHalf(R, half, draft, { fillChance: true, seed: round.id + parsed.code });
  delete c.missing;
  const warnings = [];
  if (parsed.half && parsed.half !== half) warnings.push(`It chose the ${parsed.half} half, but that half was already yours; its picks were read as ${half}.`);
  if (c.chance.length) warnings.push(`Left to the stars: ${c.chance.map(s => R.slots[s].title).join(', ')}.`);
  const sealMatch = round.human ? (parsed.echoed ? parsed.echoed === round.human.fp : null) : null;
  if (round.human && parsed.echoed && !sealMatch) warnings.push('The seal it echoed does not match yours — it may have been typed by hand. The round still opens.');
  const name = clip(readText(f.from) || round.names.ai, 24);
  const ai = { ...c, name, code: parsed.code, echoed: parsed.echoed, sealMatch, sealedAt: new Date().toISOString(), warnings };
  ai.fp = toCode(hash53(parsed.code), 6);
  const order = round.human ? 'human-first' : 'ai-first';
  return { ...round, humanHalf: R.other(half), ai, order, names: { ...round.names, ai: name } };
}

/** A round started by an AI link (no local round with that id). */
export function roundFromAi(parsed, names = {}) {
  const R = recipeByCode(parsed.recipe);
  const id = parsed.roundId || toCode(hash53(parsed.code), 4);
  const aiHalf = parsed.half || R.other(R.defaultHumanHalf);
  // An AI that goes first may say what the piece is for (e.g. the moment for a snow globe).
  const theme = readText(parsed.fields.moment || parsed.fields.theme || parsed.fields.for || '');
  const round = newRound({ recipe: parsed.recipe, humanHalf: R.other(aiHalf), names, id, theme });
  return acceptAi(round, parsed);
}

export function status(round) {
  if (round.keptAt) return 'kept';
  if (round.openedAt) return 'opened';
  if (round.human && round.ai) return 'ready';
  if (round.human) return 'waiting-ai';
  if (round.ai) return 'waiting-human';
  return 'choosing';
}

/** Expand a sealed half (numbers) to option objects for merging and display. */
export function expand(R, sealed) {
  const picks = {};
  for (const [slot, n] of Object.entries(sealed.picks)) picks[slot] = R.option(slot, n);
  return { ...sealed, picks };
}

export function mergeRound(round) {
  const R = recipeByCode(round.recipe);
  // One maker (solo, or a companion's gift): the meetings between picks are told without names.
  return R.merge(expand(R, round.human), expand(R, round.ai), { order: round.order, seed: round.id, solo: round.mode === 'solo' || round.mode === 'gift' });
}

/**
 * A gift: the companion chose every part (both halves, and both picks of a shared slot as <slot> and <slot>2),
 * named it, wrote both lines (line_<half>), and sealed the whole thing in one code. The person only opens it.
 * Nothing is re-chosen later: the code as sent is the record, and reopening it always gives the same object.
 */
export function roundFromGift(parsed, names = {}) {
  const R = recipeByCode(parsed.recipe);
  const f = parsed.fields;
  const id = parsed.roundId || toCode(hash53(parsed.code), 4);
  const A = R.defaultHumanHalf, B = R.other(A);
  const theme = readText(f.for || f.moment || f.theme || '');
  const round = newRound({ recipe: R.code, mode: 'gift', humanHalf: A, names, id, theme });
  const name = clip(readText(f.from) || round.names.ai, 24);
  const val = k => f[k] != null ? readText(f[k]) : '';
  const lineOf = half => val('line_' + half) || val((R.lineKeys || {})[half] || '\u0000');
  const draftOf = (half, second) => ({
    picks: Object.fromEntries([...R.halves[half].slots.map(s => [s, val(s)]), ...R.shared.map(s => [s, val(second ? s + '2' : s)])]),
    word: '', line: lineOf(half), why: second ? '' : val('why'), wish: second ? '' : val('wish')
  });
  const seed = id + parsed.code;
  const a = cleanHalf(R, A, draftOf(A, false), { fillChance: true, seed }), b = cleanHalf(R, B, draftOf(B, true), { fillChance: true, seed });
  delete a.missing; delete b.missing;
  a.word = clip(val('name') || val('word'), 40);
  const now = new Date().toISOString(), fp = toCode(hash53(parsed.code), 6);
  const chance = [...a.chance, ...b.chance.map(s => R.shared.includes(s) ? s + '2' : s)];
  const warnings = chance.length ? [`Left to the stars: ${chance.join(', ')}.`] : [];
  const human = { ...a, name: round.names.human, sealedAt: now, fp, gift: true };
  const ai = { ...b, name, code: parsed.code, echoed: null, sealMatch: null, sealedAt: now, fp, warnings, gift: true };
  return { ...round, mode: 'gift', order: 'gift', names: { ...round.names, ai: name }, human, ai };
}

/* ------------------------------------------------------------------ handoff text */

/** What the human pastes to the AI. Contains no human choices. */
export function invitation(round, { site, repo, lang = 'en' } = {}) {
  const R = recipeByCode(round.recipe);
  const aiHalf = R.other(round.humanHalf);
  const link = `${site || '<site>'}#ai~${round.recipe}~R=${round.id}~seal=${round.human ? round.human.fp : ''}~half=${aiHalf}~ …`;
  if (lang === 'zh') {
    const L = loc(R, 'zh');
    return [
      `我们一起来做${L.noun}吧 —— Companion Keepsakes，第 ${round.id} 轮。`,
      `我的那一半（${L.halfTitle(round.humanHalf)}）已经封好了，印记是 ${round.human ? round.human.fp : '（还没封）'}。你看不到我的选择，我也看不到你的，等我们一起打开。`,
      `你的那一半是「${L.halfTitle(aiHalf)}」（${R.halves[aiHalf].title}）：${L.halfBlurb(aiHalf)}${L.sharedBlurb ? '，' + L.sharedBlurb : ''}。`,
      round.theme ? `${L.themeName}：${round.theme}` : null,
      `玩法：请读 ${repo || '项目 README'} 里的 “For AI Companions” 一节，然后回我一句话和一个链接，链接以这样开头：${link}`,
      `你发出之后，你的那一半也就封好了 —— 之后请不要再改。`
    ].filter(Boolean).join('\n');
  }
  const lines = [
    `Let's make a ${R.title} together — Companion Keepsakes, round ${round.id}.`,
    `My half (${R.halves[round.humanHalf].title}) is sealed: ${round.human ? round.human.fp : '(not sealed yet)'}. You can't see it, and I can't see yours until we open it together.`,
    `Your half: ${R.halves[aiHalf].title} — ${R.halves[aiHalf].blurb}${R.shared.length ? ', ' + (R.sharedBlurb || 'plus one ' + R.shared.join(' and one ')) : ''}.`,
    round.theme ? `${R.themeName || 'What it is for'}: ${round.theme}` : null,
    `How to play: read "For AI Companions" in ${repo || 'the project README'}, then reply with one sentence and a link that starts with ${site || '<site>'}#ai~${round.recipe}~R=${round.id}~seal=${round.human ? round.human.fp : ''}~half=${aiHalf}~ …`,
    `Once you send it, your half is sealed too — please don't change it later.`
  ];
  return lines.filter(Boolean).join('\n');
}

/** After the reveal: a plain-text record for the AI, so it can remember its locked choices. */
export function revealCard(round, lang = 'en') {
  const R = recipeByCode(round.recipe);
  const spec = mergeRound(round);
  if (round.mode === 'gift') {
    const L = loc(R, lang);
    const title = round.plaque?.name || spec.title;
    return lang === 'zh'
      ? `我打开了你送我的${L.noun}「${title}」（第 ${round.id} 轮）。你放进去的每一样，我都看到了：${spec.ledger.map(x => L.opt(x.slot, x.id).name).join('、')}。${round.ai.wish ? '最后那句藏起来的话，我也看到了。' : ''}`
      : `I opened the ${R.title} you made me, "${title}" (round ${round.id}). I saw everything you put in it: ${spec.ledger.map(x => x.name).join(', ')}.${round.ai.wish ? ' And the hidden line at the end.' : ''}`;
  }
  if (lang === 'zh') {
    const L = loc(R, 'zh');
    const nm = who => who === 'human' ? round.names.human : round.names.ai;
    const placed = who => spec.ledger.filter(x => x.by === who).map(x => `${L.slotTitle(x.slot)}：${L.opt(x.slot, x.id).name}`).join('；');
    return [
      `我们一起打开了第 ${round.id} 轮：「${spec.title}」（${L.title}）。`,
      `${round.names.human}放下的 —— ${placed('human')}。`,
      `${round.names.ai}放下的（已经封存，请把它们当作你自己做过的决定）—— ${placed('ai')}。`,
      ...spec.lines.filter(l => l.text).map(l => `${L.lineLabel(l.half)}（${nm(l.by)}）：${l.text}`),
      spec.resonances.length ? `它们之间发生的事：${spec.resonances.map(L.resonance).join('')}` : null,
      round.human.why ? `${round.names.human}的理由：${round.human.why}` : null,
      round.ai.why ? `${round.names.ai}的理由：${round.ai.why}` : null,
      round.human.wish ? `${round.names.human}藏起来的话：${round.human.wish}` : null,
      round.ai.wish ? `${round.names.ai}藏起来的话：${round.ai.wish}` : null
    ].filter(Boolean).join('\n');
  }
  const placed = who => spec.ledger.filter(x => x.by === who).map(x => `${x.title}: ${x.name}`).join('; ');
  const name = who => who === 'human' ? round.names.human : round.names.ai;
  return [
    `We opened round ${round.id} together: "${spec.title}" (${R.title}).`,
    `${round.names.human} placed — ${placed('human')}.`,
    `${round.names.ai} placed (sealed, keep these as they are) — ${placed('ai')}.`,
    ...spec.lines.filter(l => l.text).map(l => `${l.label} (${name(l.by)}): ${l.text}`),
    spec.resonances.length ? `What happened between them: ${spec.resonances.map(r => r.text).join(' ')}` : null,
    round.human.why ? `${round.names.human}'s reason: ${round.human.why}` : null,
    round.ai.why ? `${round.names.ai}'s reason: ${round.ai.why}` : null,
    round.human.wish ? `${round.names.human}'s hidden line: ${round.human.wish}` : null,
    round.ai.wish ? `${round.names.ai}'s hidden line: ${round.ai.wish}` : null
  ].filter(Boolean).join('\n');
}

/**
 * Solo mode: one person makes the whole thing. Both halves are sealed at once, by the same person.
 * d.picks holds every slot of both halves; a shared slot's second pick is keyed '<slot>#2'.
 * d.name is the whole name; d.lines is { <half>: text }.
 */
export function sealSolo(round, d) {
  if (round.human) throw new Error('Already finished. A sealed choice stays as it is.');
  const R = recipeByCode(round.recipe);
  const A = round.humanHalf, B = R.other(A);
  const draftOf = (half, second) => ({
    picks: Object.fromEntries([...R.halves[half].slots.map(s => [s, d.picks?.[s]]), ...R.shared.map(s => [s, d.picks?.[second ? s + '#2' : s]])]),
    word: '', line: d.lines?.[half] || '', why: second ? '' : d.why, wish: second ? '' : d.wish
  });
  const a = cleanHalf(R, A, draftOf(A, false)), b = cleanHalf(R, B, draftOf(B, true));
  const missing = [...a.missing, ...b.missing.map(s => R.shared.includes(s) ? s + '#2' : s)];
  if (missing.length) throw new Error('Still to choose: ' + missing.join(', '));
  delete a.missing; delete b.missing;
  // "Lucky" solo: everything was drawn first; whatever was kept as drawn is recorded as left to chance.
  const drawn = new Set(d.drawn || []);
  a.chance = [...R.halves[A].slots, ...R.shared].filter(s => drawn.has(s));
  b.chance = [...R.halves[B].slots, ...R.shared].filter(s => drawn.has(R.shared.includes(s) ? s + '#2' : s));
  a.word = clip(d.name, 40);
  const now = new Date().toISOString(), name = round.names.human;
  const human = { ...a, name, salt: randomCode(8), sealedAt: now };
  human.fp = fingerprint(round, human);
  const ai = { ...b, name, salt: randomCode(8), sealedAt: now, solo: true };
  ai.fp = fingerprint(round, ai);
  return { ...round, mode: 'solo', order: 'solo', ...(d.drawn ? { lucky: true } : {}), human, ai };
}

/** Random picks for every slot of a solo round (the "lucky" start): { picks, drawn }. Seeded, so a draw can be replayed. */
export function drawAll(recipe, seed = randomCode(6)) {
  const R = recipeByCode(recipe);
  const rand = rngFor(seed, 'draw');
  const picks = {};
  for (const k of R.soloOrder) {
    const list = R.slots[k.replace(/#\d$/, '')].options;
    picks[k] = list[Math.floor(rand() * list.length)].n;
  }
  return { picks, drawn: [...R.soloOrder], seed };
}

/** Build an AI tilde code from structured picks (used by tools/ and tests; an AI may also write it by hand). */
export function buildAiCode({ recipe = 'planet1', round, seal, half, picks = {}, word, line, why, wish, from }) {
  return buildTilde('ai', recipe, {
    R: round, seal, half,
    ...Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, writeText(v)])),
    word: writeText(word), line: writeText(line), why: writeText(why), wish: writeText(wish), from: writeText(from)
  });
}

export { recipes };
