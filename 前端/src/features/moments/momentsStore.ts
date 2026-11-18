import { create } from 'zustand';
import { listMoments, createMoment, patchMoment, deleteMoment, type MomentItem } from '@/lib/api/moments';

/**
 * 心动收藏 store（三十四改）：本地乐观更新 + 写穿后端（moments 表）。
 * 长按聊天消息「收进心动」走 addMoment；/moments 页翻看。
 */
interface MomentsState {
  items: MomentItem[];
  loaded: boolean;
  load: () => Promise<void>;
  addMoment: (content: string, tag?: string) => MomentItem;
  togglePin: (id: string) => void;
  remove: (id: string) => void;
}

export const useMomentsStore = create<MomentsState>((set) => ({
  items: [],
  loaded: false,

  load: async () => {
    try {
      set({ items: await listMoments(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addMoment: (content, tag = '') => {
    const m: MomentItem = {
      id: `m${Date.now()}${Math.floor(Math.random() * 1000)}`,
      content,
      tag,
      pinned: false,
      createdAt: Date.now(),
    };
    set((s) => ({ items: [m, ...s.items] }));
    void createMoment(content, tag).catch(() => {});
    return m;
  },

  togglePin: (id) => {
    let next = false;
    set((s) => ({
      items: s.items.map((m) => {
        if (m.id !== id) return m;
        next = !m.pinned;
        return { ...m, pinned: next };
      }),
    }));
    void patchMoment(id, { pinned: next }).catch(() => {});
  },

  remove: (id) => {
    set((s) => ({ items: s.items.filter((m) => m.id !== id) }));
    void deleteMoment(id).catch(() => {});
  },
}));
