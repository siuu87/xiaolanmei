import { request } from './conversations';

/** anchor = OB 记忆锚点（「白起的内心」面板里的第一种卡片），其它三种是原来的分类 */
export type MemoryCategory = 'fact' | 'event' | 'relation' | 'anchor';

export interface MemoryDTO {
  id: string;
  category: MemoryCategory;
  content: string;
  source: 'manual' | 'model';
  relatedEntity: string | null;
  importance: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SummaryDTO {
  id: string;
  conversationId: string;
  fromMessageId: string | null;
  toMessageId: string | null;
  content: string;
  model: string | null;
  createdAt: number;
}

/**
 * 记忆列表。**不传参数时行为与改造前完全一致**（重要度倒序、只给未删除的）；
 * `q` / `category` / `sort='time'` 是「白起的内心」面板做检索用的。
 */
export const listMemories = (opts?: {
  q?: string;
  category?: MemoryCategory | 'all';
  active?: boolean;
  sort?: 'importance' | 'time';
}) => {
  const params = new URLSearchParams();
  if (opts?.q?.trim()) params.set('q', opts.q.trim());
  if (opts?.category && opts.category !== 'all') params.set('category', opts.category);
  if (opts?.active !== undefined) params.set('active', opts.active ? '1' : '0');
  if (opts?.sort === 'time') params.set('sort', 'time');
  const qs = params.toString();
  return request<MemoryDTO[]>(`/api/memories${qs ? `?${qs}` : ''}`);
};

export const createMemory = (input: {
  category: MemoryCategory;
  content: string;
  importance?: number;
  relatedEntity?: string | null;
}) =>
  request<{ id: string }>('/api/memories', {
    method: 'POST',
    body: JSON.stringify({ ...input, source: 'manual' }),
  });

export const patchMemory = (
  id: string,
  patch: Partial<{
    category: MemoryCategory;
    content: string;
    importance: number;
    relatedEntity: string | null;
    active: boolean;
  }>,
) => request<{ ok: true }>(`/api/memories/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteMemory = (id: string) =>
  request<{ ok: true }>(`/api/memories/${id}`, { method: 'DELETE' });

export const extractMemories = (text: string) =>
  request<{ created: { id: string; category: string; content: string }[] }>(
    '/api/memories/extract',
    { method: 'POST', body: JSON.stringify({ text }) },
  );

export const listSummaries = (conversationId?: string) =>
  request<SummaryDTO[]>(
    `/api/summaries${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`,
  );

export const generateSummary = (
  conversationId: string,
  fromMessageId?: string,
  toMessageId?: string,
) =>
  request<{ id: string; content: string; createdAt: number }>('/api/summaries/generate', {
    method: 'POST',
    body: JSON.stringify({ conversationId, fromMessageId, toMessageId }),
  });

export const deleteSummary = (id: string) =>
  request<{ ok: true }>(`/api/summaries/${id}`, { method: 'DELETE' });
