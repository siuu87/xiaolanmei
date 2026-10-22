import { request } from './conversations';
import type { Gift, NewGift } from '@/features/gifts/giftStore';

// ---- 礼物盒 ----
export const listGifts = () => request<Gift[]>('/api/gifts');
export const createGift = (gift: Gift) =>
  request<{ id: string }>('/api/gifts', { method: 'POST', body: JSON.stringify(gift) });
export const patchGift = (id: string, patch: Partial<NewGift & { isOpened: boolean }>) =>
  request<{ ok: true }>(`/api/gifts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteGift = (id: string) =>
  request<{ ok: true }>(`/api/gifts/${id}`, { method: 'DELETE' });
