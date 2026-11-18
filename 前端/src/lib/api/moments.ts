import { request } from './conversations';

/** 一条心动收藏（三十四改）：聊天长按收进来的句子 */
export interface MomentItem {
  id: string;
  content: string;
  tag: string;
  pinned: boolean;
  createdAt: number;
}

export const listMoments = () => request<MomentItem[]>('/api/moments');

export const createMoment = (content: string, tag = '') =>
  request<{ id: string }>('/api/moments', {
    method: 'POST',
    body: JSON.stringify({ content, tag }),
  });

export const patchMoment = (id: string, patch: Partial<Pick<MomentItem, 'content' | 'tag' | 'pinned'>>) =>
  request<{ ok: true }>(`/api/moments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteMoment = (id: string) =>
  request<{ ok: true }>(`/api/moments/${id}`, { method: 'DELETE' });
