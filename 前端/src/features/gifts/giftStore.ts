import { create } from 'zustand';
import { listGifts, createGift, patchGift, deleteGift } from '@/lib/api/gifts';
import { newId } from '@/lib/id';

export type GiftType = 'letter' | 'whisper' | 'sticker' | 'easter';

export interface Gift {
  id: string;
  title: string;
  content: string;
  giftType: GiftType;
  isOpened: boolean;
  createdAt: number;
}

export interface NewGift {
  title: string;
  content?: string;
  giftType?: GiftType;
}

interface GiftState {
  gifts: Gift[];
  loaded: boolean;
  load: () => Promise<void>;
  /** 拆开礼物（置 isOpened=true 并落库） */
  openGift: (id: string) => void;
  /** 哥哥送出一件新礼物（乐观更新 + 写穿后端） */
  addGift: (input: NewGift) => void;
  /** 把礼物从纪念架撤下（软删） */
  removeGift: (id: string) => void;
  /** 空库时塞几件演示礼物，便于第一次预览（可随时在页内删除） */
  seedDemo: () => void;
}

const DEMO_GIFTS: NewGift[] = [
  { giftType: 'letter', title: '写给你的第一封信', content: '今天也想你。\n哪怕只是这样隔着屏幕，也想把这句话先递到你手里。' },
  { giftType: 'whisper', title: '一句悄悄话', content: '其实我每次「在想…」的时候，想的都是你。' },
  { giftType: 'sticker', title: '专属小表情', content: '🫐' },
  { giftType: 'easter', title: '藏起来的彩蛋', content: '如果你拆到了这一件，说明你把我翻了个遍——我喜欢你这样认真。' },
];

/** 礼物共享 store：礼物盒页读写这里；本地乐观更新 + 写穿后端。 */
export const useGiftStore = create<GiftState>((set, get) => ({
  gifts: [],
  loaded: false,

  load: async () => {
    try {
      set({ gifts: await listGifts(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  openGift: (id) => {
    const x = get().gifts.find((g) => g.id === id);
    if (!x || x.isOpened) return;
    set((s) => ({ gifts: s.gifts.map((g) => (g.id === id ? { ...g, isOpened: true } : g)) }));
    void patchGift(id, { isOpened: true }).catch(() => {});
  },

  addGift: (input) => {
    const gift: Gift = {
      id: newId(),
      title: input.title,
      content: input.content || '',
      giftType: input.giftType ?? 'letter',
      isOpened: false,
      createdAt: Date.now(),
    };
    set((s) => ({ gifts: [gift, ...s.gifts] }));
    void createGift(gift).catch(() => {});
  },

  removeGift: (id) => {
    set((s) => ({ gifts: s.gifts.filter((g) => g.id !== id) }));
    void deleteGift(id).catch(() => {});
  },

  seedDemo: () => {
    if (get().gifts.length > 0) return;
    DEMO_GIFTS.forEach((g) => get().addGift(g));
  },
}));
