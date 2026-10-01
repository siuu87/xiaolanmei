import { request } from './conversations';

export interface MemoDTO {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  importance: number;
  pinned: boolean;
  order: number;
  authorType: 'user' | 'agent';
  source: string;
  fromWho: string | null;
  toWho: string | null;
  avatarSeed: string | null;
  emoji: string | null;
  avatarColor: string | null;
  needNotify: boolean;
  ownerSide: 'me' | 'partner';
  status: 'unfiled' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export interface MemoInput {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  importance?: number;
  fromWho?: string;
  toWho?: string;
  avatarSeed?: string;
  ownerSide?: 'me' | 'partner';
  status?: 'unfiled' | 'archived';
}

export interface MemoCategoryDTO {
  category: string;
  count: number;
}

export const listMemos = (params?: { category?: string; search?: string; tag?: string; folder?: string; status?: string; ownerSide?: string }) => {
  const q = new URLSearchParams();
  if (params?.category) q.set('category', params.category);
  if (params?.search) q.set('search', params.search);
  if (params?.tag) q.set('tag', params.tag);
  if (params?.folder) q.set('folder', params.folder);
  if (params?.status) q.set('status', params.status);
  if (params?.ownerSide) q.set('ownerSide', params.ownerSide);
  const qs = q.toString();
  return request<MemoDTO[]>(`/api/memo${qs ? `?${qs}` : ''}`);
};

export const listMemoCategories = () =>
  request<{ total: number; categories: MemoCategoryDTO[] }>('/api/memo/categories');

export const createMemo = (input: MemoInput) =>
  request<{ id: string; chunkCount: number; collectionId: string }>('/api/memo', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const patchMemo = (
  id: string,
  patch: Partial<{ title: string; content: string; category: string; tags: string[]; importance: number; pinned: boolean; ownerSide: 'me' | 'partner'; status: 'unfiled' | 'archived' }>,
) => request<{ ok: true }>(`/api/memo/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const organizeMemos = () =>
  request<{ organized: number }>('/api/memo/organize', { method: 'POST' });

export const deleteMemo = (id: string) =>
  request<{ ok: true }>(`/api/memo/${id}`, { method: 'DELETE' });

export const toggleMemoPin = (id: string) =>
  request<{ pinned: boolean }>(`/api/memo/${id}/pin`, { method: 'POST' });

export const toggleMemoNotify = (id: string) =>
  request<{ needNotify: boolean }>(`/api/memo/${id}/notify`, { method: 'POST' });

export const claimMemo = (id: string, patch: { fromWho?: string; toWho?: string }) =>
  request<{ ok: true }>(`/api/memo/${id}/claim`, { method: 'POST', body: JSON.stringify(patch) });

export const reorderMemos = (orderedIds: string[]) =>
  request<{ ok: true; count: number }>('/api/memo/reorder', {
    method: 'POST',
    body: JSON.stringify({ orderedIds }),
  });
