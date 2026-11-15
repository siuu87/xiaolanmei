import { create } from 'zustand';
import {
  listDiaries,
  createDiary,
  deleteDiary,
  patchDiary,
  listDiaryBooks,
  createDiaryBook,
  patchDiaryBook,
  deleteDiaryBook,
  listDiarySlips,
  createDiarySlip,
  patchDiarySlip,
  deleteDiarySlip,
  listDiaryStickers,
  createDiarySticker,
  patchDiarySticker,
  deleteDiarySticker,
  listDiaryPageLocks,
  lockDiaryPage,
  unlockDiaryPage,
  sneakDiaryPage,
  claimTaDiaryNote,
} from '@/lib/api/home';
import { newId } from '@/lib/id';
import type { DiaryEntry, DiaryBook, DiaryPageLock, DiarySlip, DiarySticker } from './diaryData';

interface DiaryState {
  entries: DiaryEntry[];
  books: DiaryBook[];
  slips: DiarySlip[];
  /** 贴在纸上的表情包贴纸（按 book + date 归到某一页） */
  stickers: DiarySticker[];
  /** 锁着的页（只锁某一天，不影响整本） */
  pageLocks: DiaryPageLock[];
  loaded: boolean;
  load: () => Promise<void>;
  addEntry: (e: Omit<DiaryEntry, 'id'>) => void;
  patchEntry: (
    id: string,
    patch: Partial<Pick<DiaryEntry, 'date' | 'content' | 'bookId' | 'images' | 'time' | 'mood' | 'tags'>>,
  ) => void;
  removeEntry: (id: string) => void;
  addBook: (b: Omit<DiaryBook, 'id' | 'sortOrder'>) => void;
  patchBook: (
    id: string,
    patch: Partial<Pick<DiaryBook, 'name' | 'kind' | 'cover' | 'coverImage' | 'locked' | 'lockCode'>>,
  ) => void;
  removeBook: (id: string) => void;
  addSlip: (s: Omit<DiarySlip, 'id'>) => void;
  patchSlip: (id: string, patch: Partial<Pick<DiarySlip, 'date' | 'content' | 'color' | 'x' | 'y'>>) => void;
  removeSlip: (id: string) => void;
  /** 后端塞回来的纸条（TA 的回条 / 他主动留的）直接并进 store，不重复写库 */
  mergeSlip: (slip: DiarySlip) => void;
  /** 纸条相关的轻提示（「他发现了」/「这页多了一张他留的纸条」），由 DlogBook 弹出来 */
  slipNotice: { text: string; at: number } | null;
  clearSlipNotice: () => void;
  /** TA 主动来留字条（每次翻日记问一次，命中才会有） */
  askTaNote: (bookId: string, date: string) => Promise<DiarySlip | null>;
  addSticker: (s: Omit<DiarySticker, 'id'>) => void;
  patchSticker: (id: string, patch: Partial<Pick<DiarySticker, 'x' | 'y' | 'scale' | 'rot'>>) => void;
  removeSticker: (id: string) => void;
  /** 给某一天上锁（同一本同一天重复上锁会换密码、敲的次数归零） */
  lockPage: (bookId: string, date: string, code: string) => Promise<void>;
  /** 彻底解开这一页（自己解 / TA 敲够了来开） */
  unlockPage: (bookId: string, date: string) => Promise<void>;
  /** 撬锁：密码猜不出来时的第三条路（会被 TA 发现） */
  sneakPage: (bookId: string, date: string, tries: number) => Promise<{ ok: boolean; line: string }>;
  /** 敲过之后同步次数（TA 开门时顺手把锁从本地抹掉） */
  setPageKnocks: (bookId: string, date: string, knocks: number) => void;
}

/** 日记 store：书架 + 日记条目 + 小纸条，本地乐观更新 + 写穿后端，刷新不丢。 */
/** 上次见过的「他的便签」id（跨刷新记着，否则提示等于没有） */
const TA_SEEN_KEY = 'diary-seen-ta-slips';

/**
 * 找出一张**刚浮现**的他的便签（跟上次比多出来的那张），顺手更新基准。
 *
 * 只在有基准时才提示：第一次进日记本不能一上来就报「多了五张」。
 */
function freshTaSlips(slips: DiarySlip[]): DiarySlip | undefined {
  const taSlips = slips.filter((s) => s.author === 'ta');
  let baseline: string[] | null = null;
  try {
    const raw = localStorage.getItem(TA_SEEN_KEY);
    baseline = raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    baseline = null;
  }
  try {
    localStorage.setItem(TA_SEEN_KEY, JSON.stringify(taSlips.map((s) => s.id).slice(-60)));
  } catch {
    // 隐私模式写不了就算了，大不了不提示
  }
  if (!baseline) return undefined;
  const seen = new Set(baseline);
  return taSlips.find((s) => !seen.has(s.id));
}

export const useDiaryStore = create<DiaryState>((set, get) => ({
  entries: [],
  books: [],
  slips: [],
  slipNotice: null,
  stickers: [],
  pageLocks: [],
  loaded: false,

  load: async () => {
    try {
      const [entries, books, slips, stickers, pageLocks] = await Promise.all([
        listDiaries(),
        listDiaryBooks(),
        listDiarySlips(),
        listDiaryStickers(),
        listDiaryPageLocks(),
      ]);
      // 他的便签是**到点才浮现**的（后端 `reveal_at`）：跟上次见过的比，
      // 如果多了一张他的条，轻轻提一句 —— 不然那张纸会安安静静躺在某一页里，
      // 翻不到就永远不知道他回过。
      //
      // 基准放 localStorage 而不是内存：刷新一次就忘掉的话，提示等于没有。
      // 第一次打开（没有基准）只记录、不提示，免得一进来就报「多了 5 张」。
      const fresh = freshTaSlips(slips);
      set({
        entries,
        books,
        slips,
        stickers,
        pageLocks,
        loaded: true,
        ...(fresh
          ? {
              slipNotice: {
                text: `有张他的便签落下来了 · ${Number(fresh.date.split('-')[1])} 月 ${Number(fresh.date.split('-')[2])} 日`,
                at: Date.now(),
              },
            }
          : {}),
      });
    } catch {
      set({ loaded: true });
    }
  },

  addEntry: (e) => {
    const entry: DiaryEntry = { ...e, id: newId() };
    set((s) => ({ entries: [entry, ...s.entries] }));
    void createDiary(entry).catch(() => {});
  },

  patchEntry: (id, patch) => {
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
    void patchDiary(id, patch).catch(() => {});
  },

  removeEntry: (id) => {
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    void deleteDiary(id).catch(() => {});
  },

  addBook: (b) => {
    const book: DiaryBook = { ...b, id: newId(), sortOrder: get().books.length };
    set((s) => ({ books: [...s.books, book] }));
    void createDiaryBook(book).catch(() => {});
  },

  patchBook: (id, patch) => {
    set((s) => ({ books: s.books.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
    void patchDiaryBook(id, patch).catch(() => {});
  },

  removeBook: (id) => {
    set((s) => ({
      books: s.books.filter((b) => b.id !== id),
      entries: s.entries.filter((e) => e.bookId !== id),
      slips: s.slips.filter((x) => x.bookId !== id),
      stickers: s.stickers.filter((x) => x.bookId !== id),
    }));
    void deleteDiaryBook(id).catch(() => {});
  },

  addSlip: (s) => {
    const slip: DiarySlip = { ...s, id: newId(), author: 'me' };
    set((st) => ({ slips: [...st.slips, slip] }));
    // 他会不会回、什么时候回都不在这里发生（2026-11-16）：
    // 他的条埋在 6~36 小时之后才浮现，所以存下我这张就只管存，不当场塞一张他的进来。
    void createDiarySlip(slip).catch(() => {});
  },

  mergeSlip: (slip) => {
    set((st) => ({
      slips: st.slips.some((x) => x.id === slip.id) ? st.slips : [...st.slips, slip],
    }));
  },

  clearSlipNotice: () => set({ slipNotice: null }),

  /**
   * 翻到某页时问一句「他来过吗」（2026-11-16 改）。
   * 他真来过的话，条会埋在 2~18 小时之后才浮现，所以这个请求现在纯粹是
   * 「掷一次他今天会不会路过的骰子」：当下拿不到东西，也不该当场提示。
   */
  askTaNote: async (bookId, date) => {
    try {
      await claimTaDiaryNote({ bookId, date });
    } catch {
      // 掷骰子失败就算了，下一页再掷
    }
    return null;
  },

  sneakPage: async (bookId, date, tries) => {
    try {
      const r = await sneakDiaryPage({ bookId, date, tries });
      set((st) => ({
        pageLocks: st.pageLocks.map((p) =>
          p.bookId === bookId && p.date === date ? { ...p, sneakedAt: p.sneakedAt || Date.now() } : p,
        ),
      }));
      return { ok: true, line: r.line ?? '' };
    } catch {
      return { ok: false, line: '' };
    }
  },

  patchSlip: (id, patch) => {
    set((st) => ({ slips: st.slips.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    void patchDiarySlip(id, patch).catch(() => {});
  },

  removeSlip: (id) => {
    set((st) => ({ slips: st.slips.filter((x) => x.id !== id) }));
    void deleteDiarySlip(id).catch(() => {});
  },

  addSticker: (s) => {
    const sticker: DiarySticker = { ...s, id: newId() };
    set((st) => ({ stickers: [...st.stickers, sticker] }));
    void createDiarySticker(sticker).catch(() => {});
  },

  patchSticker: (id, patch) => {
    set((st) => ({ stickers: st.stickers.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    void patchDiarySticker(id, patch).catch(() => {});
  },

  removeSticker: (id) => {
    set((st) => ({ stickers: st.stickers.filter((x) => x.id !== id) }));
    void deleteDiarySticker(id).catch(() => {});
  },

  lockPage: async (bookId, date, code) => {
    // 先本地落一条（锁面立刻出现），再把后端返回的 id 认回来
    const tmp: DiaryPageLock = { id: newId(), bookId, date, knocks: 0, openedBy: '', openedAt: 0 };
    set((st) => ({
      pageLocks: [...st.pageLocks.filter((p) => !(p.bookId === bookId && p.date === date)), tmp],
    }));
    try {
      const { id } = await lockDiaryPage({ bookId, date, code });
      set((st) => ({ pageLocks: st.pageLocks.map((p) => (p.id === tmp.id ? { ...p, id } : p)) }));
    } catch {
      set((st) => ({ pageLocks: st.pageLocks.filter((p) => p.id !== tmp.id) }));
    }
  },

  unlockPage: async (bookId, date) => {
    set((st) => ({ pageLocks: st.pageLocks.filter((p) => !(p.bookId === bookId && p.date === date)) }));
    void unlockDiaryPage(bookId, date).catch(() => {});
  },

  setPageKnocks: (bookId, date, knocks) => {
    set((st) => ({
      pageLocks: st.pageLocks.map((p) =>
        p.bookId === bookId && p.date === date ? { ...p, knocks } : p,
      ),
    }));
  },
}));
