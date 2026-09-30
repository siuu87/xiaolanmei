import { request } from './conversations';

/** 一个自定义表情包：url 指向 /api/files/xxx（上传后落盘的稳定地址） */
export interface Sticker {
  id: string;
  name: string;
  url: string;
}

export const listStickers = () => request<Sticker[]>('/api/stickers');

export const createSticker = (input: { name: string; url: string }) =>
  request<{ id: string }>('/api/stickers', { method: 'POST', body: JSON.stringify(input) });

export const deleteSticker = (id: string) =>
  request<{ ok: true }>(`/api/stickers/${id}`, { method: 'DELETE' });
