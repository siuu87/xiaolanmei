// Two-Person Talisman — recipe v1.
// A refined bag charm: a silver (or gold) clasp, a strand of six beads, a hanging charm, and a small silk pouch.
// Two halves that never collide: SILK (the pouch, its stitched motif, the cord, beads 1·3·5) and
// METAL (the finish, the charm, beads 2·4·6). On the strand the two of you alternate, bead by bead.
// Both hidden lines are folded inside the pouch and come out last ("untie the pouch").

import { joinWords, cap, enOf, zhOf, MONTHS_ZH } from './util.js';

export const id = 'talisman';
export const version = 1;
export const code = 'talisman1';
export const title = 'Two-Person Talisman';
export const tagline = 'A small charm to carry: one bead each, in turn, and a pouch for two wishes.';
export const noun = 'a talisman';
export const soloOrder = ['metal', 'silk', 'motif', 'cord', 'bead1', 'bead2', 'bead3', 'bead4', 'bead5', 'bead6', 'charm'];
export const waitingLine = 'half of the strand is still unstrung';
export const renderer = 'talisman3d';
export const backdropSlot = 'silk';
export const wishTitle = n => 'Untie the pouch';

export const halves = {
  silk: {
    title: 'Silk',
    blurb: 'the soft part: the silk pouch, the motif stitched on it, its cord, and beads 1, 3 and 5',
    slots: ['silk', 'motif', 'cord', 'bead1', 'bead3', 'bead5'],
    line: { label: 'Stitched on the pouch', hint: 'a short blessing, as if embroidered on the silk' }
  },
  metal: {
    title: 'Metal',
    blurb: 'the hard part: the metal, the charm that hangs beside the pouch, and beads 2, 4 and 6',
    slots: ['metal', 'charm', 'bead2', 'bead4', 'bead6'],
    line: { label: 'Engraved on the back of the charm', hint: 'one sentence: what this talisman promises' }
  }
};
// Gift codes (the companion makes everything) may name each half's line by this key instead of line_<half>.
export const lineKeys = { silk: 'blessing', metal: 'promise' };
export const shared = [];

const o = (n, id, name, meaning, extra = {}) => ({ n, id, name, meaning, ...extra });

// The bead table. Numbers are permanent (links made earlier must keep reading the same bead);
// new beads are only ever appended. `group` and `month` arrange the menu; `shape`/`mat` drive the renderer.
const G1 = 'Birthstones', G2 = 'Soft & warm', G3 = 'Stones that catch light', G4 = 'Earth stones';
const BEADS = [
  // Birthstones, January to December
  o(9, 'garnet', 'Garnet', 'devotion', { group: G1, month: 'January', shape: 'facet', mat: 'glass', color: '#B8323F' }),
  o(6, 'amethyst', 'Amethyst', 'a quiet mind', { group: G1, month: 'February', shape: 'facet', mat: 'glass', color: '#9473D6' }),
  o(5, 'aqua', 'Aquamarine', 'a calm crossing', { group: G1, month: 'March', shape: 'facet', mat: 'glass', color: '#74BEE0' }),
  o(29, 'herkimer', 'Herkimer diamond', 'still clear under pressure', { group: G1, month: 'April', shape: 'herkimer', mat: 'glass', color: '#F7FAFF' }),
  o(15, 'emerald', 'Emerald', 'love that keeps renewing', { group: G1, month: 'May', shape: 'facet', mat: 'glass', color: '#1F9D6B' }),
  o(1, 'pearl', 'Freshwater pearl', 'patience, made slowly', { group: G1, month: 'June', shape: 'pearl', mat: 'pearl', color: '#F3ECE2' }),
  o(4, 'moonstone', 'Moonstone', 'for the nights apart', { group: G1, month: 'June', shape: 'round', mat: 'moon', color: '#E6ECF6' }),
  o(13, 'ruby', 'Ruby', 'a brave heart', { group: G1, month: 'July', shape: 'bicone', mat: 'glass', color: '#C21E3A' }),
  o(17, 'peridot', 'Peridot', 'light after a hard time', { group: G1, month: 'August', shape: 'facet', mat: 'glass', color: '#9CC64A' }),
  o(14, 'sapphire', 'Sapphire', 'faithfulness', { group: G1, month: 'September', shape: 'bicone', mat: 'glass', color: '#2747A8' }),
  o(16, 'opal', 'Opal', 'every colour at once', { group: G1, month: 'October', shape: 'round', mat: 'opal', color: '#F3EFF4' }),
  o(7, 'citrine', 'Citrine', 'small daily joys', { group: G1, month: 'November', shape: 'facet', mat: 'glass', color: '#EDB940' }),
  o(18, 'turquoise', 'Turquoise', 'a safe journey', { group: G1, month: 'December', shape: 'round', mat: 'veined', color: '#3EB7B0' }),
  o(27, 'tanzanite', 'Tanzanite', 'rare, and found once', { group: G1, month: 'December', shape: 'bicone', mat: 'glass', color: '#5B4FC9' }),
  // Soft & warm
  o(28, 'baroque', 'Baroque pearl', 'beautiful because it is uneven', { group: G2, shape: 'baroque', mat: 'pearl', color: '#F1E8DE' }),
  o(31, 'shell', 'Mother-of-pearl', 'a home you can carry', { group: G2, shape: 'disc', mat: 'shell', color: '#F4EEF0' }),
  o(20, 'amber', 'Amber', 'a moment kept warm', { group: G2, shape: 'round', mat: 'amber', color: '#E08A1E' }),
  o(3, 'rose', 'Rose quartz', 'tenderness', { group: G2, shape: 'round', mat: 'stone', color: '#F2C6CF' }),
  o(30, 'morganite', 'Morganite', 'love, without fear', { group: G2, shape: 'bicone', mat: 'glass', color: '#F0B2A6' }),
  o(11, 'frost', 'Frosted glass', 'a soft, quiet light', { group: G2, shape: 'round', mat: 'frost', color: '#EEF2F8' }),
  // Stones that catch light
  o(19, 'labradorite', 'Labradorite', 'a flash of light when you least expect it', { group: G3, shape: 'round', mat: 'labra', color: '#5E6670' }),
  o(24, 'sunstone', 'Sunstone', 'warmth on a cold day', { group: G3, shape: 'round', mat: 'glitter', color: '#E8925A' }),
  o(2, 'clear', 'Clear crystal', 'nothing hidden between us', { group: G3, shape: 'facet', mat: 'glass', color: '#F4F8FF' }),
  o(25, 'fluorite', 'Fluorite', 'a clear head', { group: G3, shape: 'facet', mat: 'banded', bands: ['#B9A2E8', '#E9F3F0', '#8FD1B4', '#C9B9F2'], color: '#C6B8EE' }),
  o(10, 'smoky', 'Smoky quartz', 'holding the hard days', { group: G3, shape: 'facet', mat: 'glass', color: '#86766A' }),
  // Earth stones
  o(8, 'jade', 'Pale jade', 'growing, steadily', { group: G4, shape: 'round', mat: 'stone', color: '#B9DDB9' }),
  o(12, 'lapis', 'Lapis', 'the truth, told kindly', { group: G4, shape: 'round', mat: 'glitter', color: '#34509C' }),
  o(21, 'tiger', "Tiger's eye", 'steady courage', { group: G4, shape: 'round', mat: 'banded', bands: ['#5C3612', '#B8792A', '#E2B154', '#8A5420'], color: '#B8792A' }),
  o(23, 'malachite', 'Malachite', 'change, gently', { group: G4, shape: 'round', mat: 'banded', bands: ['#0E5A3A', '#2F9E6A', '#7ED3A2', '#1B7A4C'], color: '#2F9E6A' }),
  o(26, 'aventurine', 'Green aventurine', 'a little luck', { group: G4, shape: 'round', mat: 'glitter', color: '#5FA36A' }),
  o(22, 'onyx', 'Black onyx', 'strength, quietly', { group: G4, shape: 'round', mat: 'onyx', color: '#17161C' })
];
const beadSlot = k => ({ title: `Bead ${k}`, prompt: `Bead ${k} of 6 on the strand.`, options: BEADS, grouped: true });

export const slots = {
  silk: {
    title: 'Silk', prompt: 'What silk is the pouch made of?',
    options: [
      o(1, 'ivory', 'Ivory silk', 'a clean beginning', { color: '#F1E9DC', bg: ['#FBF7F0', '#EDE4D6'] }),
      o(2, 'blush', 'Blush pink', 'warmth, a little shy', { color: '#EBB9C2', bg: ['#FCF1F2', '#F0DADF'] }),
      o(3, 'lilac', 'Lilac', 'dreaming', { color: '#C6B5E6', bg: ['#F5F1FB', '#E3DCF1'] }),
      o(4, 'indigo', 'Deep indigo', 'depth, and night', { color: '#2F3A78', bg: ['#262B4F', '#121530'], dark: true }),
      o(5, 'sage', 'Sage', 'rest', { color: '#AFC5A6', bg: ['#F3F6EF', '#DFE7D9'] }),
      o(6, 'vermilion', 'Vermilion', 'protection, the old way', { color: '#C8463B', bg: ['#FBF2EE', '#EED9D2'] }),
      o(7, 'sky', 'Pale sky', 'open air', { color: '#B7D3EE', bg: ['#F1F7FC', '#DCE8F4'] })
    ]
  },
  motif: {
    title: 'Stitched motif', prompt: 'What is stitched on the pouch?',
    options: [
      o(1, 'plain', 'Plain silk', 'some things are better unsaid'),
      o(2, 'crescent', 'Crescent', 'a light for the dark hours'),
      o(3, 'blossom', 'Plum blossom', 'the first flower, in the cold'),
      o(4, 'wave', 'Wave', 'going out, and coming back'),
      o(5, 'crane', 'Crane', 'a long life, together'),
      o(6, 'star', 'Star', 'a fixed point to find')
    ]
  },
  cord: {
    title: 'Cord', prompt: 'What cord ties the pouch?',
    options: [
      o(1, 'red', 'Red cord', 'the red thread between two people', { color: '#B8343A' }),
      o(2, 'gold', 'Gold cord', 'something worth keeping', { color: '#D3A94F' }),
      o(3, 'white', 'White cord', 'a promise kept simply', { color: '#F4F1EA' }),
      o(4, 'navy', 'Navy cord', 'steady, like the night', { color: '#2C3566' }),
      o(5, 'pink', 'Pink cord', 'fondness', { color: '#E9A3B5' }),
      o(6, 'moss', 'Moss cord', 'roots', { color: '#6F8B5E' })
    ]
  },
  metal: {
    title: 'Metal', prompt: 'What is the metal?',
    options: [
      o(1, 'silver', 'Bright silver', 'clear, and plain', { color: '#D9DCE2', ink: '#5F6475' }),
      o(2, 'gold', 'Soft gold', 'a warmth that lasts', { color: '#E6C27A', ink: '#7A5E2A' }),
      o(3, 'rose', 'Rose gold', 'tenderness that wears well', { color: '#E9B39E', ink: '#7C4E45' }),
      o(4, 'brass', 'Antique brass', 'as if it was always there', { color: '#B8975E', ink: '#5E4A2A' })
    ]
  },
  charm: {
    title: 'Charm', prompt: 'What hangs beside the pouch?',
    options: [
      o(1, 'moon', 'Crescent moon', "I'm here at night too", { mat: 'metal' }),
      o(2, 'star', 'Star', 'something to steer by', { mat: 'metal' }),
      o(3, 'heart', 'Heart', 'plainly said', { mat: 'metal' }),
      o(4, 'butterfly', 'Glass butterfly', 'changing, and staying', { mat: 'glass', color: '#EAF2FF' }),
      o(5, 'key', 'Little key', 'you have one', { mat: 'metal' }),
      o(6, 'bell', 'Small bell', 'so I hear you coming', { mat: 'metal' }),
      o(7, 'flower', 'White flower', 'something that keeps opening', { mat: 'frost', color: '#FBFBFD' }),
      o(8, 'leaf', 'Green leaf', 'new things', { mat: 'glass', color: '#9FCB8E' }),
      o(9, 'cherry', 'Cherries', 'a pair, always', { mat: 'glass', color: '#C8283A' })
    ]
  },
  bead1: beadSlot(1), bead2: beadSlot(2), bead3: beadSlot(3), bead4: beadSlot(4), bead5: beadSlot(5), bead6: beadSlot(6)
};

export const text = {
  word: { label: 'One word of its name', hint: 'the two words become what the talisman is called, e.g. "Quiet" + "Courage"', max: 24 },
  line: { max: 120 },
  why: { label: 'Why you chose these', hint: 'one sentence, sealed with your choice', max: 200 },
  wish: { label: 'A line for the pouch', hint: 'optional; folded inside the pouch until the very end', max: 200 }
};

export const defaultHumanHalf = 'silk';

export function slotsOf(half) { return [...halves[half].slots, ...shared]; }
export function other(half) { return half === 'silk' ? 'metal' : 'silk'; }
export function halfOfSlot(slot) { return halves.silk.slots.includes(slot) ? 'silk' : halves.metal.slots.includes(slot) ? 'metal' : null; }

export function option(slot, value) {
  const list = slots[slot]?.options || [];
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  if (/^\d+$/.test(v)) return list.find(x => x.n === Number(v)) || null;
  const words = v.replace(/[_-]+/g, ' ');
  return list.find(x => x.id === v || x.name.toLowerCase() === words) || null;
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t));
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
}

const low = s => s.charAt(0).toLowerCase() + s.slice(1);
const p_charm = p => p.charm.name.toLowerCase();
const zn = (slot, o) => (slot.startsWith('bead') ? zh.beads[o.id] : zh.slots[slot].options[o.id])[0];
const hasBead = (p, id) => [1, 2, 3, 4, 5, 6].some(k => p['bead' + k].id === id);
// Named meetings between the two halves. With names (companion mode) they say who; alone (solo) they don't.
// Arguments: s = the silk side's name, m = the metal side's name (both '' in solo).
const RESONANCES = [
  { id: 'same-moon', when: p => p.motif.id === 'crescent' && p.charm.id === 'moon',
    say: (s, m) => s ? `The same moon twice: ${s} stitched it in silk, ${m} cast it in metal.` : 'The same moon twice: stitched in silk, and cast in metal.',
    zh: (s, m) => s ? `同一个月亮出现了两次：${s}把它绣在丝绸上，${m}把它铸成了金属。` : '同一个月亮出现了两次：一个绣在丝绸上，一个铸成了金属。' },
  { id: 'same-star', when: p => p.motif.id === 'star' && p.charm.id === 'star',
    say: (s, m) => s ? `The same star twice: ${s} stitched it, ${m} cast it.` : 'The same star twice: one stitched, one cast.',
    zh: (s, m) => s ? `同一颗星星出现了两次：${s}绣了它，${m}铸了它。` : '同一颗星星出现了两次：一颗绣的，一颗铸的。' },
  { id: 'moonstone-moon', when: p => p.charm.id === 'moon' && hasBead(p, 'moonstone'),
    say: (s, m) => `The moonstone on the strand catches the light of ${enOf(m)}crescent.`,
    zh: (s, m) => `串上的月光石，接住了${zhOf(m)}弯月的光。` },
  { id: 'heart-rose', when: p => p.charm.id === 'heart' && hasBead(p, 'rose'),
    say: (s, m) => `Rose quartz on the strand, and ${enOf(m)}heart beside the pouch: it says the same thing twice.`,
    zh: (s, m) => `串上的粉晶，和小袋旁${zhOf(m)}那颗心：同一句话，说了两次。` },
  { id: 'star-citrine', when: p => p.charm.id === 'star' && hasBead(p, 'citrine'),
    say: () => 'The citrine and the star keep the same small gold light.', zh: () => '黄水晶和星星，守着同一点小小的金光。' },
  { id: 'leaf-jade', when: p => p.charm.id === 'leaf' && hasBead(p, 'jade'),
    say: () => 'Pale jade and a green leaf: everything on it is growing.', zh: () => '浅色玉和绿叶：上面的一切都在生长。' },
  { id: 'red-thread', when: p => p.cord.id === 'red',
    say: (s, m) => s ? `${s}'s red cord is the thread that holds ${m}'s charm to the pouch.` : 'The red cord is the thread that holds the charm to the pouch.',
    zh: (s, m) => `${zhOf(s)}红绳，就是把${zhOf(m)}吊坠系在小袋上的那根线。` },
  { id: 'key-pouch', when: p => p.charm.id === 'key',
    say: (s, m) => cap(`${enOf(m)}little key hangs beside ${enOf(s)}pouch, as if it opens it.`),
    zh: (s, m) => `${zhOf(m)}小钥匙挂在${zhOf(s)}小袋旁边，好像能把它打开。` },
  { id: 'bell-pouch', when: p => p.charm.id === 'bell',
    say: (s, m) => cap(`${enOf(m)}bell rests against ${enOf(s)}pouch; it rings softly when you walk.`),
    zh: (s, m) => `${zhOf(m)}小铃铛靠着${zhOf(s)}小袋；走路的时候，会轻轻地响。` },
  { id: 'crane-wave', when: p => p.motif.id === 'crane' && p.charm.id === 'butterfly',
    say: (s, m) => s ? `${s}'s crane and ${m}'s butterfly: two things that fly, on one charm.` : 'A crane and a butterfly: two things that fly, on one charm.',
    zh: (s, m) => `${zhOf(s)}鹤和${zhOf(m)}蝴蝶：两样会飞的东西，在同一个护身符上。` },
  { id: 'amber-sun', when: p => hasBead(p, 'amber') && hasBead(p, 'sunstone'),
    say: () => 'Amber and sunstone: two small, kept warmths.', zh: () => '琥珀和太阳石：两份被留住的小小温暖。' },
  { id: 'labradorite-moon', when: p => hasBead(p, 'labradorite') && ['moon', 'star'].includes(p.charm.id),
    say: (s, m, p) => `The labradorite flashes blue whenever ${enOf(m)}${p_charm(p)} turns.`,
    zh: (s, m, p) => `每当${zhOf(m)}${zn('charm', p.charm)}转过来，拉长石就闪一下蓝光。` },
  { id: 'pearls', when: p => hasBead(p, 'pearl') && hasBead(p, 'baroque'),
    say: () => 'A round pearl and an uneven one: both pearls, both right.', zh: () => '一颗圆珍珠，一颗不规则的：都是珍珠，都刚刚好。' },
  { id: 'gold-gold', when: p => p.cord.id === 'gold' && ['gold', 'brass'].includes(p.metal.id),
    say: () => 'Gold cord and warm metal: it reads as one piece.', zh: () => '金绳和暖色的金属：看起来像是一体的。' }
];

export function merge(h, a, ctx = {}) {
  const side = { [h.half]: h, [a.half]: a };
  const by = { [h.half]: 'human', [a.half]: 'ai' };
  const p = {};
  for (const half of ['silk', 'metal']) for (const slot of halves[half].slots) p[slot] = side[half].picks[slot];
  const S = side.silk, M = side.metal;

  // The strand: positions 1..6 alternate silk (odd) and metal (even).
  const strand = [1, 2, 3, 4, 5, 6].map(k => ({ pos: k, ...p['bead' + k], by: by[k % 2 ? 'silk' : 'metal'] }));

  const resonances = [];
  // Echo: the same bead chosen on both sides, without knowing.
  const silkBeads = new Set([1, 3, 5].map(k => p['bead' + k].id));
  const shared = [...new Set([2, 4, 6].map(k => p['bead' + k].id).filter(id => silkBeads.has(id)))];
  for (const id of shared) {
    const b = BEADS.find(x => x.id === id);
    resonances.push(ctx.solo
      ? { id: 'echo-' + id, text: `${b.name}, chosen twice: it sits on both sides of the strand.`, zh: `${zh.beads[id][0]}选了两次；珠串的两边都有它。` }
      : { id: 'echo-' + id, text: `You both chose ${low(b.name)} without knowing; it sits on both sides of the strand.`, zh: `你们不约而同地选了${zh.beads[id][0]}；珠串的两边都有它。` });
  }
  // Birthstones: if a month appears on both sides, say so.
  const months = side => new Set((side === 'silk' ? [1, 3, 5] : [2, 4, 6]).map(k => p['bead' + k].month).filter(Boolean));
  const ms = months('silk'), mm = months('metal');
  const bothMonths = [...ms].filter(m => mm.has(m));
  if (bothMonths.length) resonances.push({ id: 'month', text: `Two stones from ${bothMonths.join(' and ')} met on the strand.`, zh: `两颗${bothMonths.map(m => MONTHS_ZH[m]).join('和')}的生日石，在珠串上相遇了。` });
  const sn = ctx.solo ? '' : S.name, mn = ctx.solo ? '' : M.name;
  for (const r of RESONANCES) if (r.when(p)) resonances.push({ id: r.id, text: r.say(sn, mn, p), zh: r.zh(sn, mn, p) });

  const first = ctx.order === 'ai-first' ? a : h, second = first === h ? a : h;
  const words = [first, second].map(x => ({ text: x.word || '', by: x === h ? 'human' : 'ai' })).filter(w => w.text);
  const silk = p.silk, metal = p.metal;

  return {
    recipe: code,
    title: joinWords(words.map(w => w.text)) || 'An unnamed charm',
    words,
    halves: { silk: by.silk, metal: by.metal },
    picks: Object.fromEntries(Object.entries(p).map(([slot, opt]) => [slot, { ...opt, by: by[halfOfSlot(slot)] }])),
    strand,
    echo: shared.length > 0,
    echoBeads: shared,
    palette: {
      bg: silk.bg, dark: !!silk.dark, ink: silk.dark ? '#E6E3FF' : mix(metal.ink, '#3A3350', 0.4),
      silk: silk.color, cord: p.cord.color, metal: metal.color, light: '#FFFFFF'
    },
    flags: {},
    resonances,
    lines: [
      { key: 'blessing', half: 'silk', label: halves.silk.line.label, text: S.line || '', by: by.silk },
      { key: 'promise', half: 'metal', label: halves.metal.line.label, text: M.line || '', by: by.metal }
    ],
    ledger: ['silk', 'metal'].flatMap(half => halves[half].slots.map(slot => ({ slot, id: p[slot].id, title: slots[slot].title, name: p[slot].name, meaning: p[slot].meaning, by: by[half] }))),
    why: { human: h.why || '', ai: a.why || '' },
    wish: { human: h.wish || '', ai: a.wish || '' },
    chance: { human: h.chance || [], ai: a.chance || [] }
  };
}

/** The reveal: metal and silk first, then the strand bead by bead (alternating), then the charm and the pouch's details. */
export function revealSteps(spec) {
  const pick = slot => ({ kind: 'pick', slot, title: slots[slot].title, pick: spec.picks[slot], by: spec.picks[slot].by });
  const steps = [pick('metal'), pick('silk')];
  for (let k = 1; k <= 6; k++) steps.push({ ...pick('bead' + k), title: `Bead ${k}` });
  steps.push(pick('charm'), pick('motif'), pick('cord'));
  for (const r of spec.resonances) steps.push({ kind: 'resonance', text: r.text });
  steps.push({ kind: 'name', words: spec.words, title: spec.title });
  steps.push({ kind: 'lines', lines: spec.lines });
  return steps;
}

/* ------------------------------------------------------------------ 中文 */
export const zh = {
  untitled: '一枚还没有名字的护身符',
  title: '护身符', noun: '一个护身符', tagline: '一串可以随身带着的小串珠，丝绸小袋里藏着悄悄话。',
  hand: 'a little talisman',
  card: '一串可以随身带着的小串珠。你们一人一颗地串上去，丝绸小袋里藏着两句悄悄话。',
  cardSolo: '一串可以随身带着的小串珠。每一颗珠子都有自己的意思，丝绸小袋里藏着一句悄悄话。',
  halves: {
    silk: { title: '丝绸', blurb: '柔软的部分：丝绸小袋、绣在上面的图案、系绳，以及第 1、3、5 颗珠子', line: { label: '绣在小袋上的话', hint: '一句短短的祝福，像绣在丝绸上那样' } },
    metal: { title: '金属', blurb: '坚硬的部分：金属、挂在小袋旁的吊坠，以及第 2、4、6 颗珠子', line: { label: '刻在吊坠背面的话', hint: '一句话：这个护身符许下的承诺' } }
  },
  waitingLine: '珠串还有一半没串上',
  themeName: '它是为了', themePrompt: { label: '这个护身符是为了什么？（可以不填）', placeholder: '比如：为了三月那趟远行' },
  wishTitle: () => '解开小袋',
  text: { word: { label: '名字里的一个词', hint: '两个词合在一起，就是它的名字，比如“安静”+“勇气”' }, wish: { label: '放进小袋的一句话', hint: '可以不写；它会一直折在小袋里，直到最后' } },
  groups: { 'Birthstones': '生日石', 'Soft & warm': '柔软与温暖', 'Stones that catch light': '会捕捉光的石头', 'Earth stones': '大地之石' },
  beadTitle: k => `第 ${k} 颗珠子`, beadPrompt: k => `串在第 ${k} 个位置的珠子。`,
  beads: {
    garnet: ['石榴石', '专一'], amethyst: ['紫水晶', '安静的心'], aqua: ['海蓝宝', '平静地渡过'], herkimer: ['赫基蒙钻', '在压力下依然清澈'],
    emerald: ['祖母绿', '一直在更新的爱'], pearl: ['淡水珍珠', '耐心，慢慢长成'], moonstone: ['月光石', '给分开的那些夜晚'], ruby: ['红宝石', '一颗勇敢的心'],
    peridot: ['橄榄石', '难熬之后的光'], sapphire: ['蓝宝石', '忠诚'], opal: ['欧泊', '所有颜色同时出现'], citrine: ['黄水晶', '每天的小快乐'],
    turquoise: ['绿松石', '平安的旅程'], tanzanite: ['坦桑石', '稀有，只遇见一次'],
    baroque: ['巴洛克珍珠', '因为不规则，才好看'], shell: ['贝母', '可以带着走的家'], amber: ['琥珀', '被留住温度的一刻'], rose: ['粉晶', '温柔'],
    morganite: ['摩根石', '不害怕的爱'], frost: ['磨砂玻璃', '柔和、安静的光'],
    labradorite: ['拉长石', '在你没想到的时候，闪一下'], sunstone: ['太阳石', '冷天里的温暖'], clear: ['白水晶', '我们之间没有隐瞒'], fluorite: ['萤石', '清醒的头脑'], smoky: ['茶晶', '陪你撑过难熬的日子'],
    jade: ['浅色玉', '稳稳地长大'], lapis: ['青金石', '温柔地说真话'], tiger: ['虎眼石', '稳稳的勇气'], malachite: ['孔雀石', '温柔地改变'], aventurine: ['绿东陵', '一点点好运'], onyx: ['黑玛瑙', '安静的力量']
  },
  slots: {
    silk: { title: '丝绸', prompt: '小袋用什么丝绸？', options: { ivory: ['象牙白', '干净的开始'], blush: ['淡粉', '有一点害羞的温暖'], lilac: ['淡紫', '做梦'], indigo: ['深靛蓝', '深沉，像夜'], sage: ['鼠尾草绿', '休息'], vermilion: ['朱红', '老派的守护'], sky: ['浅天蓝', '开阔的空气'] } },
    motif: { title: '刺绣', prompt: '小袋上绣点什么？', options: { plain: ['素面', '有些话，不说更好'], crescent: ['弯月', '给黑暗时刻的一点光'], blossom: ['梅花', '寒冷里开的第一朵花'], wave: ['波浪', '出发，然后回来'], crane: ['鹤', '长长久久，一起'], star: ['星星', '一个找得到的坐标'] } },
    cord: { title: '系绳', prompt: '用什么绳子系小袋？', options: { red: ['红绳', '连着两个人的红线'], gold: ['金绳', '值得留下的东西'], white: ['白绳', '简单地守住一个约定'], navy: ['藏青绳', '像夜一样稳'], pink: ['粉绳', '喜欢'], moss: ['苔绿绳', '根'] } },
    metal: { title: '金属', prompt: '用什么金属？', options: { silver: ['亮银', '清澈、朴素'], gold: ['柔金', '一直都在的温暖'], rose: ['玫瑰金', '越戴越好看的温柔'], brass: ['古铜', '好像它本来就在那里'] } },
    charm: { title: '吊坠', prompt: '小袋旁边挂着什么？', options: { moon: ['弯月', '夜里，我也在'], star: ['星星', '可以用来认路的东西'], heart: ['心', '直接说出来'], butterfly: ['玻璃蝴蝶', '改变，也留下'], key: ['小钥匙', '你有一把'], bell: ['小铃铛', '听见你来了'], flower: ['白花', '一直在开的东西'], leaf: ['绿叶', '新的开始'], cherry: ['樱桃', '一对，一直'] } }
  }
};
