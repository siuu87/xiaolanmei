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
      set({ entries, books, slips, stickers, pageLocks, loaded: true });
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
    // 两条路会带回他的一张条：
    //   ① 潜入被发现（`discovered`）—— 他贴回来说「你进来了」；
    //   ② 他本来就会翻我的日记（`seen`）—— 看到了你夹的这张，在旁边回一句。
    void createDiarySlip(slip)
      .then((r) => {
        if (!r?.taSlip) return;
        set((st) => ({
          slips: st.slips.some((x) => x.id === r.taSlip!.id) ? st.slips : [...st.slips, r.taSlip!],
          slipNotice: {
            text: r.discovered ? '他发现了——在旁边贴了一张纸条' : '他看到了你夹的这张纸条',
            at: Date.now(),
          },
        }));
      })
      .catch(() => {});
  },

  mergeSlip: (slip) => {
    set((st) => ({
      slips: st.slips.some((x) => x.id === slip.id) ? st.slips : [...st.slips, slip],
    }));
  },

  clearSlipNotice: () => set({ slipNotice: null }),

  askTaNote: async (bookId, date) => {
    try {
      const r = await claimTaDiaryNote({ bookId, date });
      if (!r?.slip) return null;
      set((st) => ({
        slips: st.slips.some((x) => x.id === r.slip!.id) ? st.slips : [...st.slips, r.slip!],
        slipNotice: { text: '这页多了一张他留的纸条', at: Date.now() },
      }));
      return r.slip;
    } catch {
      return null;
    }
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
