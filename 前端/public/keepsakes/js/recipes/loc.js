// Localised reading of a recipe. English is the canonical data (and what AI companions read);
// each recipe also exports `zh` with the Chinese names, meanings and labels.
import { MONTHS_ZH } from './util.js';

const GENERIC_ZH = {
  word: { label: '名字里的一个词', hint: '两个词合在一起，就是它的名字' },
  why: { label: '为什么这样选', hint: '一句话，和选择一起封存' },
  wish: { label: '一句藏起来的话', hint: '可以不写；它会一直封着，直到最后' }
};

export function loc(R, lang = 'zh') {
  const Z = lang === 'zh' ? R.zh || null : null;
  const isBead = slot => /^bead\d$/.test(slot);
  const zopt = (slot, id) => isBead(slot) ? Z?.beads?.[id] : Z?.slots?.[slot]?.options?.[id];
  const base = slot => slot.replace(/#\d$/, '');
  return {
    lang,
    title: Z?.title || R.title,
    untitled: Z?.untitled || null,
    tagline: Z?.tagline || R.tagline,
    noun: Z?.noun || R.noun,
    hand: Z?.hand || R.noun,
    card: solo => (solo ? Z?.cardSolo : Z?.card) || R.tagline,
    opt(slot, o) {
      slot = base(slot);
      const id = typeof o === 'string' ? o : o?.id;
      const src = typeof o === 'object' && o ? o : R.slots[slot]?.options.find(x => x.id === id);
      const z = zopt(slot, id);
      return { name: z?.[0] || src?.name || id, meaning: z?.[1] || src?.meaning || '' };
    },
    slotTitle(slot) {
      slot = base(slot);
      if (isBead(slot) && Z?.beadTitle) return Z.beadTitle(+slot.slice(4));
      return Z?.slots?.[slot]?.title || R.slots[slot]?.title || slot;
    },
    slotPrompt(slot) {
      slot = base(slot);
      if (isBead(slot) && Z?.beadPrompt) return Z.beadPrompt(+slot.slice(4));
      return Z?.slots?.[slot]?.prompt || R.slots[slot]?.prompt || '';
    },
    halfTitle: h => Z?.halves?.[h]?.title || R.halves[h]?.title || h,
    halfBlurb: h => Z?.halves?.[h]?.blurb || R.halves[h]?.blurb || '',
    lineLabel: h => Z?.halves?.[h]?.line?.label || R.halves[h]?.line?.label || '',
    lineHint: h => Z?.halves?.[h]?.line?.hint || R.halves[h]?.line?.hint || '',
    text: key => ({ ...R.text[key], ...(lang === 'zh' ? GENERIC_ZH[key] : {}), ...(Z?.text?.[key] || {}) }),
    group: g => Z?.groups?.[g] || g,
    month: m => lang === 'zh' ? (MONTHS_ZH[m] || m) : m,
    sharedBlurb: Z?.sharedBlurb || R.sharedBlurb || '',
    waitingLine: Z?.waitingLine || R.waitingLine || '',
    themeName: Z?.themeName || R.themeName || 'What it is for',
    themePrompt: solo => (solo && Z?.themePromptSolo) || Z?.themePrompt || R.themePrompt || null,
    pairTitle: Z?.pairTitle || null,
    pairLede: solo => (solo ? Z?.pairLedeSolo : Z?.pairLede) || null,
    echoText: Z?.echoText || null,
    findLabel: key => Z?.findLabel?.[key] || null,
    wishTitle: n => (Z?.wishTitle || R.wishTitle || (() => 'Sealed lines'))(n),
    resonance: r => (lang === 'zh' && r.zh) || r.text
  };
}
