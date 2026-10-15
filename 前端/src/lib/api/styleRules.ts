import { request } from './conversations';

/** 插入位置：前 / 中 / 后（相对「角色设定」整块正文） */
export type StylePosition = 'before' | 'middle' | 'after';

export interface StyleRuleDTO {
  id: string;
  name: string;
  content: string;
  position: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface StyleRuleInput {
  name: string;
  content: string;
  position?: StylePosition;
  enabled?: boolean;
  sortOrder?: number;
}

/** 位置标签：UI 与验收都用这一份，别在别处再写一遍文案 */
export const POSITION_LABEL: Record<StylePosition, string> = {
  before: '前 · 角色设定之前',
  middle: '中 · 角色设定之中',
  after: '后 · 角色设定之后',
};

export const STYLE_POSITIONS: StylePosition[] = ['before', 'middle', 'after'];

export const listStyleRules = () => request<StyleRuleDTO[]>('/api/style-rules');

export const createStyleRule = (input: StyleRuleInput) =>
  request<{ id: string }>('/api/style-rules', { method: 'POST', body: JSON.stringify(input) });

export const patchStyleRule = (id: string, patch: Partial<StyleRuleInput>) =>
  request<{ ok: true }>(`/api/style-rules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteStyleRule = (id: string) =>
  request<{ ok: true }>(`/api/style-rules/${id}`, { method: 'DELETE' });
