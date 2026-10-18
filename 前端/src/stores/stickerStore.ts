import { create } from 'zustand';
import {
  listStickers,
  listStickerCategories,
  createSticker,
  updateSticker,
  deleteSticker,
  createStickerCategory,
  renameStickerCategory,
  deleteStickerCategory,
  type Sticker,
  type StickerCategory,
} from '@/lib/api/stickers';

interface StickerState {
  stickers: Sticker[];
  categories: StickerCategory[];
  loaded: boolean;
  load: () => Promise<void>;
  addSticker: (input: { name: string; url: string; categoryId?: string }) => Promise<void>;
  removeSticker: (id: string) => Promise<void>;
  moveSticker: (id: string, categoryId: string) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
  renameCategory: (id: string, name: string) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
}

/**
 * 自定义表情包 store：设置页上传/分类管理，聊天表情包面板按分类读取。
 * 增删改后从后端重拉，保证与上传落盘、分类归属一致。
 */
export const useStickerStore = create<StickerState>((set, get) => ({
  stickers: [],
  categories: [],
  loaded: false,

  load: async () => {
    try {
      const [stickers, categories] = await Promise.all([listStickers(), listStickerCategories()]);
      set({ stickers, categories, loaded: true });
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
    await get().load();
  },

  moveSticker: async (id, categoryId) => {
    await updateSticker(id, { categoryId });
    await get().load();
  },

  addCategory: async (name) => {
    await createStickerCategory(name);
    await get().load();
  },

  renameCategory: async (id, name) => {
    await renameStickerCategory(id, name);
    await get().load();
  },

  removeCategory: async (id) => {
    await deleteStickerCategory(id);
    await get().load();
  },
}));
