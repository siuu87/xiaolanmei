import { create } from 'zustand';
import { listStickers, createSticker, deleteSticker, type Sticker } from '@/lib/api/stickers';

interface StickerState {
  stickers: Sticker[];
  loaded: boolean;
  load: () => Promise<void>;
  addSticker: (input: { name: string; url: string }) => Promise<void>;
  removeSticker: (id: string) => Promise<void>;
}

/**
 * 自定义表情包 store：设置页上传管理，聊天表情包面板读取。
 * 增删后从后端重拉，保证与上传落盘结果一致。
 */
export const useStickerStore = create<StickerState>((set, get) => ({
  stickers: [],
  loaded: false,

  load: async () => {
    try {
      set({ stickers: await listStickers(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addSticker: async (input) => {
    await createSticker(input);
    await get().load();
  },

  removeSticker: async (id) => {
    await deleteSticker(id);
    set((s) => ({ stickers: s.stickers.filter((x) => x.id !== id) }));
  },
}));
