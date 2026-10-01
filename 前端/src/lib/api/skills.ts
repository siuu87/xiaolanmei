import { request } from './conversations';

export type SkillTriggerMode = 'keyword' | 'always' | 'manual';

export interface SkillDTO {
  id: string;
  name: string;
  slug: string;
  description: string;
  instruction: string;
  triggerKeywords: string[];
  triggerMode: SkillTriggerMode;
  icon: string | null;
  color: string | null;
  category: 'builtin' | 'custom';
  enabled: boolean;
  priority: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface SkillInput {
  name: string;
  slug?: string;
  description?: string;
  instruction: string;
  triggerKeywords?: string[];
  triggerMode?: SkillTriggerMode;
  icon?: string | null;
  color?: string | null;
  priority?: number;
}

export const listSkills = (enabledOnly = false) =>
  request<SkillDTO[]>(`/api/skills${enabledOnly ? '?enabled=true' : ''}`);

export const createSkill = (input: SkillInput) =>
  request<{ id: string; slug: string; createdAt: number }>('/api/skills', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const patchSkill = (id: string, patch: Partial<SkillInput>) =>
  request<{ ok: true }>(`/api/skills/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const toggleSkill = (id: string) =>
  request<{ enabled: boolean }>(`/api/skills/${id}/toggle`, { method: 'POST' });

export const deleteSkill = (id: string) =>
  request<{ ok: true }>(`/api/skills/${id}`, { method: 'DELETE' });

export const seedSkills = () => request<{ ok: true }>('/api/skills/seed', { method: 'POST' });

export const matchSkills = (query: string, manual?: string[]) =>
  request<{ matches: { id: string; name: string; slug: string; reason: string; confidence: number }[] }>(
    '/api/skills/match',
    { method: 'POST', body: JSON.stringify({ query, manual }) },
  );
