import { request } from './conversations';

export type MemoryCategory = 'fact' | 'event' | 'relation';

export interface MemoryDTO {
  id: string;
  category: MemoryCategory;
  content: string;
  source: 'manual' | 'model';
  relatedEntity: string | null;
  importance: number;
  active: boolean;
  createdAt: number;
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

export const listMemories = () => request<MemoryDTO[]>('/api/memories');

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
