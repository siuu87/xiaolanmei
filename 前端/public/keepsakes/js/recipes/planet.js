// Tiny Imaginary Planet — recipe v1.
// Two halves that never collide: GROUND (what the world stands on) and SKY (what surrounds it).
// Each side also places one WONDER from a shared list (both appear; the same pick becomes an "echo").
// Every visible element of the finished world comes from exactly one sealed pick, a resonance between
// two sealed picks (named in the reveal), or the round seed (exact positions only).

import { joinWords, cap, enOf, zhOf } from './util.js';

export const id = 'planet';
export const version = 1;
export const code = 'planet1';
export const title = 'Tiny Imaginary Planet';
export const tagline = 'A small world that does not need to obey anything but the two of you.';
export const noun = 'a tiny planet';
// Solo mode: one person chooses everything, in this order ('#2' = the second of a shared slot).
export const soloOrder = ['sky', 'land', 'water', 'growth', 'dwelling', 'moon', 'air', 'visitor', 'wonder', 'wonder#2'];
export const sharedBlurb = 'plus one wonder';
export const waitingLine = 'half of this world is still dark';
export const renderer = 'planet3d';      // js/render/<renderer>.js
export const backdropSlot = 'sky';       // the pick that sets the scene's backdrop during the reveal
export const wishTitle = n => n === 2 ? 'Two sealed lines remain' : 'One sealed line remains';

export const halves = {
  ground: {
    title: 'Ground',
    blurb: 'what the world stands on: land, water, what grows, who lives there',
    slots: ['land', 'water', 'growth', 'dwelling'],
    line: { label: 'A secret buried here', hint: 'one sentence hidden in the ground; found by digging after the reveal' }
  },
  sky: {
    title: 'Sky',
    blurb: 'what surrounds it: light, moons, what drifts in the air, who visits',
    slots: ['sky', 'moon', 'air', 'visitor'],
    line: { label: 'The one rule of this world', hint: 'one law this planet obeys, e.g. "Rain falls upward on birthdays"' }
  }
};
// Gift codes (the companion makes everything) may name each half's line by this key instead of line_<half>.
export const lineKeys = { ground: 'secret', sky: 'rule' };
export const shared = ['wonder'];

const o = (n, id, name, meaning, extra = {}) => ({ n, id, name, meaning, ...extra });

export const slots = {
  land: {
    title: 'Land', prompt: 'What is the ground made of?',
    options: [
      o(1, 'meadow', 'Soft meadow', 'a place to lie down and do nothing', { colors: ['#9EC891', '#86B97F', '#C4DFA6'] }),
      o(2, 'flowers', 'Flower field', 'every small kindness grows here', { colors: ['#AFD39C', '#98C58E', '#D2E7B3'], dots: ['#F6B8C8', '#FFFFFF', '#F8DE7E', '#C9B6F0'] }),
      o(3, 'dunes', 'Honey dunes', 'warm, patient, never in a hurry', { colors: ['#EDCD98', '#E0B67E', '#F6E0B7'] }),
      o(4, 'snow', 'First snow', 'quiet, clean, a new page', { colors: ['#E8EEF7', '#D3DFEF', '#FFFFFF'] }),
      o(5, 'crystal', 'Crystal plain', 'things that are clear and kept', { colors: ['#CEC3EE', '#B4A6E2', '#E8E0FB'], shards: '#E4DAFF' }),
      o(6, 'moss', 'Glowing moss', 'light that comes from below', { colors: ['#5FAE9C', '#3F8A86', '#B4E6C8'], glow: '#9CF5D8' }),
      o(7, 'autumn', 'Amber woods', 'a season that keeps its warmth', { colors: ['#E7B07B', '#D58F5D', '#F2CC98'] }),
      o(8, 'cloud', 'Cloudstone', 'ground soft enough to fall into', { colors: ['#F2ECF6', '#E2D8EE', '#FFFFFF'] }),
      o(9, 'lavender', 'Lavender hills', 'calm you can smell from far away', { colors: ['#A9B98E', '#93A77E', '#C3CDA4'], dots: ['#9B86D6', '#B7A4EA', '#8C76C8', '#D2C6F2'] }),
      o(10, 'terraces', 'Tea terraces', 'patience, one step at a time', { colors: ['#8DBE78', '#77AB68', '#B5D898'] }),
      o(11, 'ember', 'Sleeping volcano', 'warmth that waits underneath', { colors: ['#76687A', '#5F5266', '#958592'], glow: '#FF9C66' })
    ]
  },
  water: {
    title: 'Water', prompt: 'Where does the water go?',
    options: [
      o(1, 'sea', 'One round sea', 'somewhere to look out at', { level: 0.012, color: '#8CC4E6' }),
      o(2, 'lakes', 'Small lakes', 'little mirrors', { level: -0.022, color: '#93CBE8' }),
      o(3, 'river', 'River of light', 'a path that glows', { color: '#BDF1FF' }),
      o(4, 'frozen', 'Frozen lake', 'a moment held still', { level: -0.012, color: '#DCEFFB' }),
      o(5, 'floating', 'Floating ponds', 'water that forgot to fall', { color: '#9ED3F0' }),
      o(6, 'springs', 'Warm springs', 'rest, with steam rising', { level: -0.03, color: '#A8DCE0' }),
      o(7, 'none', 'No water', 'dry and quiet; the sky is enough'),
      o(8, 'starsea', 'Sea of stars', 'the sky, kept down here too', { level: 0.012, color: '#46578F' }),
      o(9, 'pools', 'Rainbow pools', 'a small joy in every colour', { level: -0.03, color: '#9FD6E6', pools: ['#9FD6E6', '#F4B9CB', '#F6DE97', '#B9E3B0', '#C6B6F0'] })
    ]
  },
  growth: {
    title: 'What grows', prompt: 'What grows there?',
    options: [
      o(1, 'round', 'Round trees', 'shade for a long afternoon'),
      o(2, 'pines', 'Little pines', 'things that stay green'),
      o(3, 'mushrooms', 'Giant mushrooms', 'small things, grown enormous'),
      o(4, 'crystaltrees', 'Crystal trees', 'growth you can see through'),
      o(5, 'lanterns', 'Lantern flowers', 'small lights left on for someone'),
      o(6, 'puffs', 'Candyfloss trees', 'sweetness, unapologetic'),
      o(7, 'reeds', 'Tall grass and reeds', 'listening to the wind'),
      o(8, 'cherry', 'Cherry blossom trees', 'a short season, loved fully'),
      o(9, 'cacti', 'Round cacti', 'soft inside, careful outside'),
      o(10, 'sunflowers', 'Sunflowers', 'always turning toward the light')
    ]
  },
  dwelling: {
    title: 'Dwelling', prompt: 'Who, or what, lives there?',
    options: [
      o(1, 'cottage', 'Cottage', 'a home with the window lit'),
      o(2, 'lighthouse', 'Lighthouse', 'so the way back is always visible'),
      o(3, 'observatory', 'Observatory', 'someone watching the sky for you'),
      o(4, 'greenhouse', 'Glass greenhouse', 'tending something slowly'),
      o(5, 'shrine', 'Small shrine', 'a place to leave wishes'),
      o(6, 'tower', 'Castle tower', 'a story with a keep'),
      o(7, 'windmill', 'Windmill', 'turning, steadily, every day'),
      o(8, 'train', 'Little train', 'always coming back around'),
      o(9, 'treehouse', 'Treehouse', 'a secret kept since childhood'),
      o(10, 'bakery', 'Little bakery', 'something warm, every morning'),
      o(11, 'tent', 'A camping tent', 'one night out, under all of it')
    ]
  },
  sky: {
    title: 'Sky', prompt: 'What light is this world under?',
    options: [
      o(1, 'dawn', 'Pink dawn', 'the start of something', { bg: ['#FCEBE3', '#F3C8CB'], light: '#FFF0E6', ink: '#7A5F7E', tint: '#F7B9B0', amount: 0.07 }),
      o(2, 'noon', 'Clear noon', 'nothing hidden', { bg: ['#EEF6FB', '#CBE3F3'], light: '#FFFFFF', ink: '#4F6A8C', tint: '#FFFFFF', amount: 0 }),
      o(3, 'sunset', 'Long sunset', "the hour you don't want to end", { bg: ['#FBE2C4', '#E7A5AE'], light: '#FFE6D2', ink: '#80566A', tint: '#F4A27E', amount: 0.08 }),
      o(4, 'bluehour', 'Blue hour', 'soft, in between', { bg: ['#D9DCF4', '#9AA3DA'], light: '#E6E9FF', ink: '#3E4787', tint: '#A4AEE8', amount: 0.12 }),
      o(5, 'night', 'Starry night', 'awake together', { bg: ['#262B57', '#0F1332'], light: '#DCE0FF', ink: '#E6E3FF', tint: '#7F88D0', amount: 0.16, dark: true }),
      o(6, 'aurora', 'Aurora night', 'a sky that dances', { bg: ['#1C3248', '#0B1428'], light: '#E2F6F0', ink: '#DDF8F0', tint: '#7CC8BC', amount: 0.14, dark: true }),
      o(7, 'eclipse', 'Eclipse', 'rare, and both of you there to see it', { bg: ['#2C2238', '#120E1C'], light: '#F8E6CC', ink: '#F4E3C8', tint: '#A88AB8', amount: 0.16, dark: true }),
      o(8, 'lilac', 'Lilac dusk', 'the softest kind of ending', { bg: ['#EFE6F6', '#CDB9E6'], light: '#F7EEFF', ink: '#5E4F86', tint: '#C7B2EA', amount: 0.1 }),
      o(9, 'milkyway', 'Milky Way', 'everything out there, all at once', { bg: ['#1F2348', '#090B20'], light: '#E4E2FF', ink: '#E8E6FF', tint: '#8D86D8', amount: 0.15, dark: true })
    ]
  },
  moon: {
    title: 'Moons', prompt: 'What circles it?',
    options: [
      o(1, 'one', 'One small moon', 'company'),
      o(2, 'twin', 'Twin moons', 'two of a kind'),
      o(3, 'rings', 'Rings', 'a promise that goes all the way around'),
      o(4, 'ringmoon', 'Rings and a moon', 'a promise, and company'),
      o(5, 'comet', 'A passing comet', 'a once-in-a-lifetime visit'),
      o(6, 'crescent', 'A close crescent', 'a smile in the sky'),
      o(7, 'sun2', 'A tiny second sun', 'warmth from an unexpected side'),
      o(8, 'moonlets', 'A string of tiny moons', 'small company, one after another'),
      o(9, 'sibling', 'A sister planet', 'not the only one out here')
    ]
  },
  air: {
    title: 'In the air', prompt: 'What drifts through the air?',
    options: [
      o(1, 'clouds', 'Drifting clouds', 'slow afternoons'),
      o(2, 'snow', 'Snowfall', 'quiet, falling'),
      o(3, 'petals', 'Falling petals', 'something gentle, all the time'),
      o(4, 'fireflies', 'Fireflies', 'little lights that answer each other'),
      o(5, 'rainbow', 'A rainbow', 'after the rain'),
      o(6, 'meteors', 'Meteor shower', 'enough wishes for everyone'),
      o(7, 'bubbles', 'Soap bubbles', 'play'),
      o(8, 'rain', 'Soft rain', 'staying in together'),
      o(9, 'skylanterns', 'Sky lanterns', 'wishes, rising slowly'),
      o(10, 'dandelion', 'Dandelion seeds', 'small wishes, blown loose')
    ]
  },
  visitor: {
    title: 'Visitor', prompt: 'Who comes to visit?',
    options: [
      o(1, 'whale', 'Floating whale', 'something large and gentle keeps watch'),
      o(2, 'cranes', 'Paper cranes', 'wishes, folded and flying'),
      o(3, 'jelly', 'Lantern jellyfish', 'drifting light'),
      o(4, 'koi', 'Sky koi', 'luck that swims through air'),
      o(5, 'birds', 'A flock of birds', 'coming home'),
      o(6, 'balloon', 'Hot-air balloon', 'someone is on their way'),
      o(7, 'fox', 'A sleeping fox', 'safe enough to sleep'),
      o(8, 'butterflies', 'Butterflies', 'something changing, gently'),
      o(9, 'owl', 'A little owl', 'someone keeping watch at night'),
      o(10, 'dragon', 'A gentle sky dragon', 'old, kind, and on your side')
    ]
  },
  wonder: {
    title: 'Wonder', prompt: 'Place one impossible thing.',
    options: [
      o(1, 'island', 'Floating island', 'a place apart, just for us'),
      o(2, 'spire', 'Crystal spire', 'a clear, tall promise'),
      o(3, 'road', 'Glowing road', 'the way we walked'),
      o(4, 'bridge', 'Bridge into the sky', 'reaching across'),
      o(5, 'lighttree', 'Tree of lights', 'every light a memory'),
      o(6, 'upfall', 'Upward waterfall', 'the impossible, made ordinary'),
      o(7, 'arch', 'Stone archway', 'a doorway to somewhere'),
      o(8, 'door', 'A door standing alone', "open it and you're here"),
      o(9, 'hourglass', 'Giant hourglass', 'time, kept on purpose'),
      o(10, 'swing', 'A swing hung from nothing', 'a little play, held up by the sky'),
      o(11, 'mailbox', 'A mailbox for the future', 'letters to who we will be')
    ]
  }
};

export const text = {
  word: { label: 'One word of its name', hint: 'the two words become the world\'s name', max: 24 },
  line: { max: 140 },
  why: { label: 'Why you chose these', hint: 'one sentence, sealed with your choice', max: 200 },
  wish: { label: 'A hidden line', hint: 'optional; stays sealed until the very end', max: 200 }
};

export const defaultHumanHalf = 'ground';

/** Slots that belong to a half, including the shared wonder. */
export function slotsOf(half) {
  return [...halves[half].slots, ...shared];
}

export function other(half) { return half === 'ground' ? 'sky' : 'ground'; }

export function option(slot, value) {
  const list = slots[slot]?.options || [];
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  if (/^\d+$/.test(v)) return list.find(x => x.n === Number(v)) || null;
  const words = v.replace(/[_-]+/g, ' ');
  return list.find(x => x.id === v || x.name.toLowerCase() === words) || null;
}

/* ------------------------------------------------------------------ merge */

const DARK = new Set(['night', 'aurora', 'eclipse', 'milkyway']);

// Resonances: named interactions between two sealed picks. They add an effect the renderer uses
// and a caption the reveal shows. They never replace either side's choice.
const RESONANCES = [
  { id: 'lantern-night', flag: 'glowGrowth', when: p => p.growth.id === 'lanterns' && DARK.has(p.sky.id),
    say: (g, s, p) => cap(`${enOf(g)}lantern flowers lit up under ${enOf(s)}${low(p.sky)}.`),
    zh: (g, s, p) => `${zhOf(g)}灯笼花，在${zhOf(s)}${zn('sky', p.sky)}下亮了起来。` },
  { id: 'moss-night', flag: 'glowLand', when: p => p.land.id === 'moss' && DARK.has(p.sky.id),
    say: (g, s) => g ? `The moss ${g} laid down began to glow once ${s} brought the dark.` : 'Once the dark came, the moss began to glow.',
    zh: (g, s) => g ? `${g}铺下的苔藓，在${s}带来夜色之后亮了起来。` : '夜色一来，苔藓就亮了起来。' },
  { id: 'river-night', flag: 'glowRiver', when: p => p.water.id === 'river' && DARK.has(p.sky.id),
    say: (g, s, p) => cap(`${enOf(g)}river of light is brightest under ${enOf(s)}${low(p.sky)}.`),
    zh: (g, s, p) => `${zhOf(g)}光之河，在${zhOf(s)}${zn('sky', p.sky)}下最亮。` },
  { id: 'aurora-ice', flag: 'reflect', when: p => p.sky.id === 'aurora' && (p.water.id === 'frozen' || p.land.id === 'snow'),
    say: (g, s) => g ? `${s}'s aurora is reflected in the ice ${g} made.` : 'The aurora is reflected in the ice.',
    zh: (g, s) => g ? `${s}的极光，倒映在${g}做的冰面上。` : '极光倒映在冰面上。' },
  { id: 'fireflies-lanterns', flag: 'glowGrowth', when: p => p.air.id === 'fireflies' && p.growth.id === 'lanterns',
    say: (g, s) => cap(`${enOf(s)}fireflies and ${enOf(g)}lantern flowers keep answering each other.`),
    zh: (g, s) => `${zhOf(s)}萤火虫和${zhOf(g)}灯笼花，一直在互相回应。` },
  { id: 'lighthouse-dark', flag: 'beam', when: p => p.dwelling.id === 'lighthouse' && DARK.has(p.sky.id),
    say: (g, s) => g ? `In ${s}'s dark, ${g}'s lighthouse turned its beam on.` : 'In the dark, the lighthouse turned its beam on.',
    zh: (g, s) => g ? `在${s}的夜色里，${g}的灯塔亮起了光束。` : '夜色里，灯塔亮起了光束。' },
  { id: 'observatory-comet', flag: 'aim', when: p => p.dwelling.id === 'observatory' && p.moon.id === 'comet',
    say: (g, s) => cap(`${enOf(g)}observatory was pointed at ${enOf(s)}comet all along.`),
    zh: (g, s) => `${zhOf(g)}天文台，原来一直对着${zhOf(s)}彗星。` },
  { id: 'cranes-shrine', flag: 'perch', when: p => p.visitor.id === 'cranes' && p.dwelling.id === 'shrine',
    say: (g, s) => cap(`${enOf(s)}paper cranes come to rest at ${enOf(g)}shrine.`),
    zh: (g, s) => `${zhOf(s)}纸鹤，停在了${zhOf(g)}许愿亭上。` },
  { id: 'rainbow-water', flag: 'rainbowWater', when: p => p.air.id === 'rainbow' && ['sea', 'lakes', 'springs', 'floating'].includes(p.water.id),
    say: (g, s) => cap(`${enOf(s)}rainbow ends in ${enOf(g)}water.`),
    zh: (g, s) => `${zhOf(s)}彩虹，落进了${zhOf(g)}水里。` },
  { id: 'snow-dunes', flag: 'snowcap', when: p => p.air.id === 'snow' && p.land.id === 'dunes',
    say: (g, s) => cap(`${enOf(s)}snow settles on ${enOf(g)}warm dunes, and somehow does not melt.`),
    zh: (g, s) => `${zhOf(s)}雪落在${zhOf(g)}温暖沙丘上，不知为什么没有融化。` },
  { id: 'whale-sea', flag: 'whaleLow', when: p => p.visitor.id === 'whale' && p.water.id === 'sea',
    say: (g, s) => cap(`${enOf(s)}whale swims low, its shadow crossing ${enOf(g)}sea.`),
    zh: (g, s) => `${zhOf(s)}鲸鱼游得很低，影子掠过${zhOf(g)}海面。` },
  { id: 'ember-snow', flag: 'steam', when: p => p.land.id === 'ember' && (p.air.id === 'snow' || p.air.id === 'rain'),
    say: (g, s, p) => cap(`${enOf(s)}${low(p.air)} meets ${enOf(g)}sleeping volcano and turns to soft steam.`),
    zh: (g, s, p) => `${zhOf(s)}${zn('air', p.air)}落在${zhOf(g)}沉睡的火山上，化成了软软的白汽。` },
  { id: 'owl-dark', flag: 'owlAwake', when: p => p.visitor.id === 'owl' && DARK.has(p.sky.id),
    say: (g, s) => g ? `It is dark now, so ${s}'s owl is awake, watching over ${g}'s world.` : 'It is dark now, so the owl is awake and watching.',
    zh: (g, s) => g ? `天黑了，${s}的小猫头鹰醒了过来，替${g}守着这个世界。` : '天黑了，小猫头鹰醒了过来，守着这个世界。' },
  { id: 'sunflowers-sun2', flag: 'twoSuns', when: p => p.growth.id === 'sunflowers' && p.moon.id === 'sun2',
    say: (g, s) => cap(`${enOf(g)}sunflowers cannot decide which of the two suns to face.`),
    zh: (g, s) => `${zhOf(g)}向日葵，不知道该朝哪一个太阳。` },
  { id: 'starsea-night', flag: 'starMirror', when: p => p.water.id === 'starsea' && DARK.has(p.sky.id),
    say: (g, s, p) => cap(`${enOf(g)}sea of stars mirrors ${enOf(s)}${low(p.sky)}, star for star.`),
    zh: (g, s, p) => `${zhOf(g)}星之海，一颗一颗地映着${zhOf(s)}${zn('sky', p.sky)}。` },
  { id: 'lanterns-rising', flag: 'lanternTrail', when: p => p.air.id === 'skylanterns' && ['shrine', 'lighthouse', 'tent'].includes(p.dwelling.id),
    say: (g, s, p) => cap(`${enOf(s)}sky lanterns rise from beside ${enOf(g)}${low(p.dwelling)}.`),
    zh: (g, s, p) => `${zhOf(s)}天灯，从${zhOf(g)}${zn('dwelling', p.dwelling)}旁边慢慢升起。` },
  { id: 'fox-home', flag: 'foxHome', when: p => p.visitor.id === 'fox' && ['cottage', 'greenhouse', 'shrine'].includes(p.dwelling.id),
    say: (g, s, p) => cap(`${enOf(s)}fox curled up by ${enOf(g)}${low(p.dwelling)}.`),
    zh: (g, s, p) => `${zhOf(s)}狐狸，蜷在${zhOf(g)}${zn('dwelling', p.dwelling)}旁边睡着了。` }
];
const low = o => o.name.toLowerCase();
const zn = (slot, o) => zh.slots[slot].options[o.id][0];

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t));
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Merge two sealed halves into a render spec.
 * h, a: { half, picks:{slot:option}, word, line, why, wish, name, chance:[] }
 */
export function merge(h, a, ctx = {}) {
  const side = { [h.half]: h, [a.half]: a };
  const by = { [h.half]: 'human', [a.half]: 'ai' };
  const p = {};
  for (const half of ['ground', 'sky']) {
    for (const slot of halves[half].slots) p[slot] = side[half].picks[slot];
  }
  const G = side.ground, S = side.sky;

  // Light merge rule: the sky tints the land, it never repaints it.
  const sky = p.sky, land = p.land;
  const landColors = land.colors.map(c => mix(c, sky.tint, sky.amount));

  const resonances = [];
  const flags = {};
  // In solo mode there is one maker: the meetings are told without names.
  const gn = ctx.solo ? '' : G.name, sn = ctx.solo ? '' : S.name;
  for (const r of RESONANCES) {
    if (!r.when(p)) continue;
    flags[r.flag] = true;
    resonances.push({ id: r.id, text: r.say(gn, sn, p), zh: r.zh(gn, sn, p) });
  }
  const echo = h.picks.wonder.id === a.picks.wonder.id;
  const w0 = h.picks.wonder;
  if (echo) resonances.unshift(ctx.solo
    ? { id: 'echo', text: `The same wonder, placed twice: ${low(w0)}. It stands twice.`, zh: `同一件奇物放了两次：${zn('wonder', w0)}。它出现了两次。` }
    : { id: 'echo', text: `You both placed the same wonder without knowing it: ${low(w0)}. It stands twice.`, zh: `你们不约而同地放下了同一件奇物：${zn('wonder', w0)}。它出现了两次。` });

  const first = ctx.order === 'ai-first' ? a : h, second = first === h ? a : h;
  const words = [first, second].map(x => ({ text: x.word || '', by: x === h ? 'human' : 'ai' })).filter(w => w.text);
  const name = joinWords(words.map(w => w.text)) || 'An unnamed world';

  return {
    recipe: code,
    title: name,
    words,
    halves: { ground: by.ground, sky: by.sky },
    picks: Object.fromEntries(Object.entries(p).map(([slot, opt]) => [slot, { ...opt, by: by[halfOfSlot(slot)] }])),
    wonders: [{ ...h.picks.wonder, by: 'human' }, { ...a.picks.wonder, by: 'ai' }],
    echo,
    palette: {
      bg: sky.bg, dark: !!sky.dark, light: sky.light, ink: sky.ink,
      land: landColors, dots: land.dots || null, glow: land.glow || null, shards: land.shards || null,
      water: p.water.color || null
    },
    flags,
    resonances,
    // Lines in reveal order. `find` names a part that must be uncovered before the line can be read.
    lines: [
      { key: 'rule', half: 'sky', label: halves.sky.line.label, text: S.line || '', by: by.sky },
      { key: 'secret', half: 'ground', label: halves.ground.line.label, text: G.line || '', by: by.ground, find: 'secret', findLabel: 'Turn the world and dig it up' }
    ],
    // Everything each side placed, in display order (story, reveal card, keepsake readers).
    ledger: [
      ...['ground', 'sky'].flatMap(half => [...halves[half].slots.map(slot => ({ slot, id: p[slot].id, title: slots[slot].title, name: p[slot].name, meaning: p[slot].meaning, by: by[half] })),
        { slot: 'wonder', id: side[half].picks.wonder.id, pick: half === 'ground' ? 'wonderH' : 'wonderA', title: 'Wonder', name: side[half].picks.wonder.name, meaning: side[half].picks.wonder.meaning, by: by[half] }])
    ],
    why: { human: h.why || '', ai: a.why || '' },
    wish: { human: h.wish || '', ai: a.wish || '' },
    chance: { human: h.chance || [], ai: a.chance || [] }
  };
}

export function halfOfSlot(slot) {
  return halves.ground.slots.includes(slot) ? 'ground' : halves.sky.slots.includes(slot) ? 'sky' : null;
}

/** The reveal, in order: alternate sides, so the world is visibly built by both. */
export function revealSteps(spec) {
  const order = ['sky', 'land', 'moon', 'water', 'air', 'growth', 'visitor', 'dwelling'];
  const steps = order.map(slot => ({ kind: 'pick', slot, title: slots[slot].title, pick: spec.picks[slot], by: spec.picks[slot].by,
    focus: slot === 'dwelling' && spec.picks.dwelling.id !== 'train' ? 'dwelling' : null }));
  steps.push({ kind: 'pair', title: 'Wonders', picks: spec.wonders, echo: spec.echo, show: ['wonderH', 'wonderA'], focus: 'front',
    echoText: 'You both chose the same wonder, without knowing.' });
  for (const r of spec.resonances.filter(r => r.id !== 'echo')) steps.push({ kind: 'resonance', text: r.text });
  steps.push({ kind: 'name', words: spec.words, title: spec.title });
  steps.push({ kind: 'lines', lines: spec.lines });
  return steps;
}

/* ------------------------------------------------------------------ 中文 */
export const zh = {
  untitled: '一颗还没有名字的星球',
  title: '小小星球', noun: '一颗小星球', tagline: '一个不必遵守任何规则的小世界。',
  hand: 'a tiny planet',
  card: '一个不必遵守任何规则的小世界。地面、天空、来访的谁，都由你们决定。',
  cardSolo: '一个不必遵守任何规则的小世界。地面、天空、来访的谁，都由你决定。',
  halves: {
    ground: { title: '地面', blurb: '世界站在什么上面：土地、水、生长的东西、住在那里的谁', line: { label: '埋在这里的秘密', hint: '一句藏在地底的话；打开之后，要转过星球才能把它挖出来' } },
    sky: { title: '天空', blurb: '围着它的一切：光、月亮、空中飘的东西、来拜访的谁', line: { label: '这个世界唯一的规则', hint: '它遵守的一条规则，比如“生日那天，雨会往上落”' } }
  },
  sharedBlurb: '再放下一件奇物', waitingLine: '这个世界，还有一半是暗的',
  themeName: '它是为了', themePrompt: { label: '这个世界是为了什么而做的？（可以不填）', placeholder: '比如：为了那些一起聊到很晚的夜晚' },
  pairTitle: '奇物', pairLede: '你们各放下一件不可能的东西。如果选了同一件，它会出现两次。', pairLedeSolo: '放下两件不可能的东西。',
  echoText: '你们不约而同地选了同一件奇物。', findLabel: { secret: '转过星球，把它挖出来' },
  wishTitle: n => n === 2 ? '还有两句封着的话' : '还有一句封着的话',
  text: { word: { label: '名字里的一个词', hint: '两个词合在一起，就是它的名字' } },
  slots: {
    land: { title: '土地', prompt: '地面是用什么做的？', options: { meadow: ['柔软的草地', '一个可以躺下来什么都不做的地方'], flowers: ['花田', '每一点小小的善意都会在这里开花'], dunes: ['蜂蜜色沙丘', '温暖、耐心、从不着急'], snow: ['初雪', '安静、干净，像新的一页'], crystal: ['水晶平原', '清澈的、被好好收着的东西'], moss: ['发光的苔藓', '从下面亮起来的光'], autumn: ['琥珀色树林', '一个一直留着温度的季节'], cloud: ['云石', '软到可以直接倒下去的地面'], lavender: ['薰衣草山坡', '远远就闻得到的安心'], terraces: ['茶园梯田', '耐心，一级一级地来'], ember: ['沉睡的火山', '藏在下面的温度'] } },
    water: { title: '水', prompt: '水流去了哪里？', options: { sea: ['一片圆圆的海', '一个可以眺望的地方'], lakes: ['几个小湖', '小小的镜子'], river: ['光之河', '一条会发亮的路'], frozen: ['结冰的湖', '被留住的一刻'], floating: ['漂浮的池塘', '忘记落下的水'], springs: ['温泉', '休息，还冒着热气'], none: ['没有水', '干燥而安静；有天空就够了'], starsea: ['星之海', '把天空也留在这里'], pools: ['彩虹小池', '每一种颜色都是一点小开心'] } },
    growth: { title: '长着什么', prompt: '那里长着什么？', options: { round: ['圆圆的树', '一个漫长午后的树荫'], pines: ['小松树', '一直绿着的东西'], mushrooms: ['巨大的蘑菇', '小东西，长得好大'], crystaltrees: ['水晶树', '看得见的成长'], lanterns: ['灯笼花', '为某个人留着的小灯'], puffs: ['棉花糖树', '甜，不需要理由'], reeds: ['高高的草和芦苇', '听风的声音'], cherry: ['樱花树', '短短的花季，好好地爱过'], cacti: ['圆圆的仙人掌', '里面柔软，外面小心'], sunflowers: ['向日葵', '一直朝着有光的地方'] } },
    dwelling: { title: '住所', prompt: '谁，或者什么，住在那里？', options: { cottage: ['小屋', '一扇亮着灯的窗'], lighthouse: ['灯塔', '让回来的路一直看得见'], observatory: ['天文台', '有人替你看着天空'], greenhouse: ['玻璃温室', '慢慢照顾一样东西'], shrine: ['许愿亭', '一个可以放下愿望的地方'], tower: ['城堡塔楼', '一个有城堡的故事'], windmill: ['风车', '一天一天，稳稳地转'], train: ['小火车', '总会绕回来'], treehouse: ['树屋', '从小守到现在的秘密'], bakery: ['小面包店', '每天早上，都有一点温热'], tent: ['露营帐篷', '在这一切下面，过一个晚上'] } },
    sky: { title: '天空', prompt: '这个世界在什么样的光里？', options: { dawn: ['粉色黎明', '某件事的开始'], noon: ['晴朗的正午', '什么都不必藏'], sunset: ['漫长的日落', '不想结束的那一小时'], bluehour: ['蓝调时刻', '柔软的、介于之间的时刻'], night: ['星夜', '一起醒着'], aurora: ['极光之夜', '会跳舞的天空'], eclipse: ['日食', '难得一见，而你们都在'], lilac: ['淡紫黄昏', '最温柔的一种结束'], milkyway: ['银河', '外面的一切，一下子都在'] } },
    moon: { title: '月亮', prompt: '有什么绕着它转？', options: { one: ['一颗小月亮', '陪伴'], twin: ['双月', '同一种的两个'], rings: ['星环', '绕了一整圈的约定'], ringmoon: ['星环和月亮', '约定，和陪伴'], comet: ['路过的彗星', '一生一次的来访'], crescent: ['很近的弯月', '天空里的一个微笑'], sun2: ['第二个小太阳', '从意想不到的方向来的温暖'], moonlets: ['一串小月亮', '一个接一个的陪伴'], sibling: ['一颗姐妹星球', '这里不是唯一的一颗'] } },
    air: { title: '空中', prompt: '空气里飘着什么？', options: { clouds: ['慢慢飘的云', '慢吞吞的下午'], snow: ['下雪', '安静地落下'], petals: ['飘落的花瓣', '温柔的事，一直在发生'], fireflies: ['萤火虫', '互相回应的小光'], rainbow: ['彩虹', '雨停之后'], meteors: ['流星雨', '每个人都够许愿'], bubbles: ['肥皂泡', '玩耍'], rain: ['细雨', '一起待在屋里'], skylanterns: ['天灯', '慢慢升起来的愿望'], dandelion: ['蒲公英', '被风吹散的小小愿望'] } },
    visitor: { title: '来访者', prompt: '谁会来拜访？', options: { whale: ['漂浮的鲸鱼', '有一个巨大又温柔的东西在守望'], cranes: ['纸鹤', '叠起来、会飞的愿望'], jelly: ['灯笼水母', '漂浮的光'], koi: ['天空锦鲤', '在空气里游的好运'], birds: ['一群鸟', '回家'], balloon: ['热气球', '有人正在来的路上'], fox: ['睡着的狐狸', '安心到可以睡着'], butterflies: ['蝴蝶', '有什么正在温柔地改变'], owl: ['小猫头鹰', '夜里有人守着'], dragon: ['温柔的天龙', '很老，很温柔，站在你这边'] } },
    wonder: { title: '奇物', prompt: '放下一件不可能的东西。', options: { island: ['漂浮的岛', '只属于我们的、远离一切的地方'], spire: ['水晶尖塔', '清澈而高高的承诺'], road: ['发光的路', '我们走过的路'], bridge: ['通往天空的桥', '伸过去的手'], lighttree: ['光之树', '每一盏灯都是一段回忆'], upfall: ['向上的瀑布', '把不可能变成日常'], arch: ['石拱门', '通往某处的门'], door: ['一扇独自立着的门', '打开它，你就在这里'], hourglass: ['巨大的沙漏', '特意留住的时间'], swing: ['挂在空中的秋千', '被天空托着的一点玩心'], mailbox: ['寄往未来的信箱', '写给以后的我们'] } }
  }
};
