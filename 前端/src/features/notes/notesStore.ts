import { create } from 'zustand';
import { listNotes, createNote, deleteNote } from '@/lib/api/home';
import { newId } from '@/lib/id';
import type { InspirationNote, LetterTheme } from './notesData';

interface NotesState {
  notes: InspirationNote[]; // 全部来信，新→旧
  loaded: boolean;
  readIds: string[]; // 已拆开读过的（全部页里显示成展开的信纸）
  load: () => Promise<void>;
  /** 手动补一封（导入/兜底用）；`letterTheme` 不传即为 default */
  addNote: (content: string, letterTheme?: LetterTheme) => Promise<void>;
  removeNote: (id: string) => void;
  markRead: (id: string) => void;
}

/** 已读只跟这台设备有关，不值得上后端——localStorage 够了 */
const READ_KEY = 'blueberry.notes.read';

function loadReadIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveReadIds(ids: string[]) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(ids));
  } catch {
    /* 隐私模式下写不了就算了，不影响读信 */
  }
}

/**
 * 深夜来信 store：前端**只负责取信，不再负责写信**。
 *
 * 信是后端 `mailScheduler` 不定时抓的（20~50 分钟摇一次号，一天最多 6 封），
 * 落到 notes 表；前端这边定时把新到的信拉回来 —— 所以开着页面不动，
 * 也可能忽然多出一封新的，这才是「不定时收到信」该有的样子。
 */
export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  loaded: false,
  readIds: loadReadIds(),

  load: async () => {
    try {
      set({ notes: await listNotes(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addNote: async (content, letterTheme = 'default') => {
    const text = content.trim();
    if (!text) return;
    const note: InspirationNote = {
      id: newId(),
      content: text,
      createdAt: Date.now(),
      letterTheme,
    };
    set((s) => ({ notes: [note, ...s.notes] }));
    try {
      await createNote(note);
    } catch {
      /* 写不进后端就先留在本地，下次 load 以服务端为准 */
    }
  },

  removeNote: (id) => {
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    void deleteNote(id).catch(() => {});
  },

  markRead: (id) => {
    const cur = get().readIds;
    if (cur.includes(id)) return;
    const next = [id, ...cur];
    set({ readIds: next });
    saveReadIds(next);
  },
}));

/**
 * 后台收信：挂载时立刻取一次，之后每 60 秒 + 窗口重新聚焦时再取。
 * AI 什么时候写信由后端决定，前端只保证信一落地就能看见。
 */
export function startMailRefresh(intervalMs = 60_000): () => void {
  const tick = () => {
    void useNotesStore.getState().load();
  };
  tick();
  const timer = window.setInterval(tick, intervalMs);
  window.addEventListener('focus', tick);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', tick);
  };
}
