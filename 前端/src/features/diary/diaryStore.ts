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
} from '@/lib/api/home';
import { newId } from '@/lib/id';
import type { DiaryEntry, DiaryBook, DiarySlip, DiarySticker } from './diaryData';

interface DiaryState {
  entries: DiaryEntry[];
  books: DiaryBook[];
  slips: DiarySlip[];
  /** 贴在纸上的表情包贴纸（按 book + date 归到某一页） */
  stickers: DiarySticker[];
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
  patchSlip: (id: string, patch: Partial<Pick<DiarySlip, 'date' | 'content' | 'color'>>) => void;
  removeSlip: (id: string) => void;
  addSticker: (s: Omit<DiarySticker, 'id'>) => void;
  patchSticker: (id: string, patch: Partial<Pick<DiarySticker, 'x' | 'y' | 'scale' | 'rot'>>) => void;
  removeSticker: (id: string) => void;
}

/** 日记 store：书架 + 日记条目 + 小纸条，本地乐观更新 + 写穿后端，刷新不丢。 */
export const useDiaryStore = create<DiaryState>((set, get) => ({
  entries: [],
  books: [],
  slips: [],
  stickers: [],
  loaded: false,

  load: async () => {
    try {
      const [entries, books, slips, stickers] = await Promise.all([
        listDiaries(),
        listDiaryBooks(),
        listDiarySlips(),
        listDiaryStickers(),
      ]);
      set({ entries, books, slips, stickers, loaded: true });
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
    const slip: DiarySlip = { ...s, id: newId() };
    set((st) => ({ slips: [...st.slips, slip] }));
    void createDiarySlip(slip).catch(() => {});
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
}));
