import { create } from 'zustand';
import { listDiaries, createDiary } from '@/lib/api/home';
import { newId } from '@/lib/id';
import type { DiaryEntry } from './diaryData';

interface DiaryState {
  entries: DiaryEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  addEntry: (e: Omit<DiaryEntry, 'id'>) => void;
}

/** 日记 store：本地乐观更新 + 写穿后端（diaries 表），刷新不丢。 */
export const useDiaryStore = create<DiaryState>((set) => ({
  entries: [],
  loaded: false,

  load: async () => {
    try {
      set({ entries: await listDiaries(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addEntry: (e) => {
    const entry: DiaryEntry = { ...e, id: newId() };
    set((s) => ({ entries: [entry, ...s.entries] }));
    void createDiary(entry).catch(() => {});
  },
}));
