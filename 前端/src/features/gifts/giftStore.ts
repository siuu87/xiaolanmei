import { create } from 'zustand';
import { listGifts, createGift, patchGift, deleteGift } from '@/lib/api/gifts';
import { newId } from '@/lib/id';

/**
 * 礼物类型（2026-11-17 收敛）：礼物盒只放「拿在手里的实物」——
 * 花束（three.js 渲的）/ object（SVG 小摆件）/ 表情 / 彩蛋。
 * letter（信）退役去信盒、whisper（悄悄话）退役去日记；
 * 旧数据后端启动时已迁成 object。
 */
export type GiftType = 'flower' | 'object' | 'sticker' | 'easter';

export interface Gift {
  id: string;
  title: string;
  content: string;
  giftType: GiftType;
  /** 附加数据（JSON 字符串）：flower 存 { bouquet }，object 存 { model: CharmModelId } */
  meta?: string | null;
  isOpened: boolean;
  createdAt: number;
}

export interface NewGift {
  title: string;
  content?: string;
  giftType?: GiftType;
  meta?: string | null;
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
  {
    giftType: 'flower',
    title: '一束温柔混搭',
    content: '今天路过花店，觉得这束像你。\n不用回什么，收着就好。',
    meta: JSON.stringify({ bouquet: 'soft' }),
  },
  {
    giftType: 'object',
    title: '一瓶星星',
    content: '折了一晚上，瓶子里的每一颗都有一个没说出口的「想你」。',
    meta: JSON.stringify({ model: 'star-jar' }),
  },
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
      giftType: input.giftType ?? 'flower',
      meta: input.meta ?? null,
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
