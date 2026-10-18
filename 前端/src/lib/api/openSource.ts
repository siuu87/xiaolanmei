import { request } from './conversations';

/**
 * 开源项目关注清单（工具箱 → 开源项目）。
 *
 * 2026-10-18 改版：**清单里只放用户自己加的项目**（后端不再自动扫依赖）。
 * 「检查更新」按钮 = 后端去 GitHub 拉每个项目的最新 release，比已知版本新就标红。
 * 这是**只读的更新检查**，不会动本地依赖。
 */

export interface OpenSourceProjectDTO {
  id: string;
  owner: string;
  repo: string;
  repoUrl: string;
  name: string;
  note: string | null;
  description: string | null;
  stars: number | null;
  language: string | null;
  homepage: string | null;
  latestVersion: string | null;
  latestPublishedAt: number | null;
  seenVersion: string | null;
  lastCheckedAt: number | null;
  hasUpdate: boolean;
  checkError: string | null;
  sortOrder: number;
  createdAt: number;
}

export interface OpenSourceSummary {
  total: number;
  updates: number;
  checkedAt: number | null;
}

export interface OpenSourceListResponse {
  items: OpenSourceProjectDTO[];
  summary: OpenSourceSummary;
}

export interface RefreshResult {
  updated: number;
  failed: { id: string; name: string; error: string }[];
  checkedAt: number;
}

export const listOpenSource = () => request<OpenSourceListResponse>('/api/open-source');

export const addOpenSource = (repoUrl: string, note?: string) =>
  request<{ id: string }>('/api/open-source', {
    method: 'POST',
    body: JSON.stringify({ repoUrl, note }),
  });

export const patchOpenSource = (id: string, patch: { note?: string; name?: string }) =>
  request<{ ok: true }>(`/api/open-source/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const removeOpenSource = (id: string) =>
  request<{ ok: true }>(`/api/open-source/${id}`, { method: 'DELETE' });

/** 点「知道了」：把当前最新版本记为已知，红点熄灭 */
export const ackOpenSource = (id: string) =>
  request<{ ok: true }>(`/api/open-source/${id}/ack`, { method: 'POST' });

/** 检查更新：不给 id = 全部刷新；给了就只刷这一个 */
export const refreshOpenSource = (id?: string) =>
  request<RefreshResult>('/api/open-source/refresh', {
    method: 'POST',
    body: JSON.stringify(id ? { id } : {}),
  });
