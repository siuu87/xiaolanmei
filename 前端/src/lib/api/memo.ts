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
  createdAt: number;
  updatedAt: number;
}

export interface MemoInput {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  importance?: number;
}

export interface MemoCategoryDTO {
  category: string;
  count: number;
}

export const listMemos = (params?: { category?: string; search?: string; tag?: string }) => {
  const q = new URLSearchParams();
  if (params?.category) q.set('category', params.category);
  if (params?.search) q.set('search', params.search);
  if (params?.tag) q.set('tag', params.tag);
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
  patch: Partial<{ title: string; content: string; category: string; tags: string[]; importance: number; pinned: boolean }>,
) => request<{ ok: true }>(`/api/memo/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteMemo = (id: string) =>
  request<{ ok: true }>(`/api/memo/${id}`, { method: 'DELETE' });

export const toggleMemoPin = (id: string) =>
  request<{ pinned: boolean }>(`/api/memo/${id}/pin`, { method: 'POST' });

export const reorderMemos = (orderedIds: string[]) =>
  request<{ ok: true; count: number }>('/api/memo/reorder', {
    method: 'POST',
    body: JSON.stringify({ orderedIds }),
  });
