import { request } from './conversations';

export type RagCategory =
  | 'preference'
  | 'agreement'
  | 'experience'
  | 'info'
  | 'inspiration'
  | 'plan'
  | 'general';

export interface RagDocumentDTO {
  id: string;
  title: string;
  content: string;
  chunkCount: number;
  source: 'manual' | 'agent' | 'import' | 'file';
  fileType: string | null;
  tags: string[] | null;
  category: string;
  importance: number;
  embeddingModel: string | null;
  meta: Record<string, unknown> | null;
  collectionIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface RagDocumentInput {
  title: string;
  content: string;
  category?: RagCategory | string;
  tags?: string[];
  importance?: number;
}

export const listRagDocuments = (params?: {
  collectionId?: string;
  category?: string;
  search?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.collectionId) q.set('collectionId', params.collectionId);
  if (params?.category) q.set('category', params.category);
  if (params?.search) q.set('search', params.search);
  const qs = q.toString();
  return request<RagDocumentDTO[]>(`/api/rag/documents${qs ? `?${qs}` : ''}`);
};

export const createRagDocument = (input: RagDocumentInput) =>
  request<{ id: string; chunkCount: number; collectionId: string }>('/api/rag/documents', {
    method: 'POST',
    body: JSON.stringify({ ...input, source: 'manual' }),
  });

export const patchRagDocument = (
  id: string,
  patch: Partial<{ title: string; content: string; category: string; tags: string[]; importance: number }>,
) => request<{ ok: true }>(`/api/rag/documents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteRagDocument = (id: string) =>
  request<{ ok: true }>(`/api/rag/documents/${id}`, { method: 'DELETE' });
