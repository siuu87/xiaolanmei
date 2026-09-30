import { request } from './conversations';

export interface WorldbookDTO {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface WorldbookInput {
  name: string;
  content: string;
  enabled?: boolean;
  sortOrder?: number;
}

export const listWorldbook = () => request<WorldbookDTO[]>('/api/worldbook');

export const createWorldbook = (input: WorldbookInput) =>
  request<{ id: string }>('/api/worldbook', { method: 'POST', body: JSON.stringify(input) });

export const patchWorldbook = (id: string, patch: Partial<WorldbookInput>) =>
  request<{ ok: true }>(`/api/worldbook/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteWorldbook = (id: string) =>
  request<{ ok: true }>(`/api/worldbook/${id}`, { method: 'DELETE' });

export const previewWorldbook = () =>
  request<{ systemPrompt: string }>('/api/worldbook/preview');
