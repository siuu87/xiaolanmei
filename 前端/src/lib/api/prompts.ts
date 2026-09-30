import { request } from './conversations';

export type PromptType = 'global' | 'model';

export interface PromptDTO {
  id: string;
  type: PromptType;
  model: string | null;
  name: string;
  content: string;
  variables: Record<string, string> | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface PromptInput {
  type?: PromptType;
  model?: string | null;
  name: string;
  content: string;
  variables?: Record<string, string> | null;
  enabled?: boolean;
  sortOrder?: number;
}

export const listPrompts = () => request<PromptDTO[]>('/api/prompts');

export const createPrompt = (input: PromptInput) =>
  request<{ id: string }>('/api/prompts', { method: 'POST', body: JSON.stringify(input) });

export const patchPrompt = (id: string, patch: Partial<PromptInput>) =>
  request<{ ok: true }>(`/api/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deletePrompt = (id: string) =>
  request<{ ok: true }>(`/api/prompts/${id}`, { method: 'DELETE' });

export const previewPrompt = (model?: string) =>
  request<{ model: string; systemPrompt: string }>(
    `/api/prompts/preview${model ? `?model=${encodeURIComponent(model)}` : ''}`,
  );
