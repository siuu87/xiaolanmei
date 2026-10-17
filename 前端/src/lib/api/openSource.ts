import { request } from './conversations';

/**
 * 开源项目清单（工具箱 → 开源项目）。
 * 只提醒不执行：后端只回「当前版 / 最新版 / GitHub 地址 / 有没有更新」，
 * 前端据此显示列表与红点，更新动作交给用户自己去 GitHub/npm 做。
 */

export type OpenSourceSide = 'frontend' | 'backend';
export type OpenSourceKind = 'dependency' | 'devDependency';

export interface OpenSourceDepDTO {
  name: string;
  side: OpenSourceSide;
  kind: OpenSourceKind;
  declared: string; // package.json 声明的范围
  installed: string | null;
  latest: string | null;
  hasUpdate: boolean;
  repoUrl: string;
  homepage: string | null;
  description: string | null;
}

export interface OpenSourceSummary {
  total: number;
  updates: number;
  checkedAt: number;
}

export interface OpenSourceListResponse {
  items: OpenSourceDepDTO[];
  summary: OpenSourceSummary;
}

export const listOpenSource = (force = false) =>
  request<OpenSourceListResponse>(`/api/open-source${force ? '?force=1' : ''}`);
