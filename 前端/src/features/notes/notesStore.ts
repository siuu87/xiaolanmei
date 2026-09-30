import { create } from 'zustand';
import { listNotes, createNote, deleteNote, generateNote } from '@/lib/api/home';
import { newId } from '@/lib/id';
import { INSPIRATION_QUOTES, dateKey, type InspirationNote } from './notesData';

interface NotesState {
  notes: InspirationNote[]; // 全部历史便签，新→旧
  loaded: boolean;
  load: () => Promise<void>;
  generateToday: () => Promise<void>; // 每日首次打开触发，幂等
  removeNote: (id: string) => void;
}

/** 尽量挑一条还没用过的本地文案（兜底） */
function pickFallback(notes: InspirationNote[]): string {
  const used = new Set(notes.map((n) => n.content));
  const fresh = INSPIRATION_QUOTES.filter((q) => !used.has(q));
  const pool = fresh.length ? fresh : INSPIRATION_QUOTES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 今日是否已生成过（按 createdAt 的本地日期判断） */
function hasToday(notes: InspirationNote[]): boolean {
  const today = dateKey();
  return notes.some((n) => dateKey(new Date(n.createdAt)) === today);
}

// 生成进行中的标志，避免并发重复生成
let generating = false;

/**
 * 灵感便签 store：
 * - 写穿后端（notes 表），刷新不丢历史；
 * - 每日首次打开自动生成一条（当天只一条，幂等）；
 * - 优先后端 AI 生成；失败/未配置则退回内置文案库。
 */
export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  loaded: false,

  load: async () => {
    try {
      set({ notes: await listNotes(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  generateToday: async () => {
    if (generating) return;
    if (hasToday(get().notes)) return;
    generating = true;
    try {
      let content: string;
      try {
        content = (await generateNote()).content;
      } catch {
        content = pickFallback(get().notes);
      }
      const note: InspirationNote = { id: newId(), content, createdAt: Date.now() };
      set((s) => ({ notes: [note, ...s.notes] }));
      void createNote(note).catch(() => {});
    } finally {
      generating = false;
    }
  },

  removeNote: (id) => {
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    void deleteNote(id).catch(() => {});
  },
}));
