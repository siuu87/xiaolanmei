import { request } from './conversations';

/** 一个自定义表情包：url 指向 /api/files/xxx（上传后落盘的稳定地址） */
export interface Sticker {
  id: string;
  name: string;
  url: string;
  /** 所属分类 id（固定存在 `default`） */
  categoryId: string;
}

/** 表情包分类；`count` 由后端顺手算好，前端不用自己数 */
export interface StickerCategory {
  id: string;
  name: string;
  count: number;
}

export const DEFAULT_STICKER_CATEGORY = 'default';

export const listStickers = () => request<Sticker[]>('/api/stickers');

export const createSticker = (input: { name: string; url: string; categoryId?: string }) =>
  request<{ id: string; categoryId: string }>('/api/stickers', {
    method: 'POST',
    body: JSON.stringify(input),
  });

/** 改名 / 换分类 */
export const updateSticker = (id: string, patch: { name?: string; categoryId?: string }) =>
  request<{ ok: true }>(`/api/stickers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteSticker = (id: string) =>
  request<{ ok: true }>(`/api/stickers/${id}`, { method: 'DELETE' });

/* ------------------------------ 分类 ------------------------------ */

export const listStickerCategories = () => request<StickerCategory[]>('/api/sticker-categories');

export const createStickerCategory = (name: string) =>
  request<StickerCategory>('/api/sticker-categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const renameStickerCategory = (id: string, name: string) =>
  request<{ ok: true }>(`/api/sticker-categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });

/** 删分类：里面的表情会被搬回「默认」，不会跟着删 */
export const deleteStickerCategory = (id: string) =>
  request<{ ok: true; movedToDefault: boolean }>(`/api/sticker-categories/${id}`, {
    method: 'DELETE',
  });
