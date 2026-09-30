import { request } from './conversations';

export interface SyncConfigDTO {
  nodeId: string;
  remoteUrl: string;
}

export interface SyncPullResult {
  cursor: string; // 复合游标 "updatedAt:id"
  changes: Record<string, unknown[]>;
}

export const getSyncConfig = () => request<SyncConfigDTO>('/api/sync/config');

export const updateSyncConfig = (input: { nodeId?: string; remoteUrl?: string }) =>
  request<{ ok: true }>('/api/sync/config', { method: 'PUT', body: JSON.stringify(input) });

export const pullChanges = (since: string) =>
  request<SyncPullResult>(`/api/sync/pull?since=${encodeURIComponent(since)}`);

export const pushChanges = (changes: Record<string, unknown[]>) =>
  request<{ ok: true; conflicts: { table: string; ids: string[] }[] }>('/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({ changes }),
  });

/** 对某个远端地址做 pull/push（用于跨端同步，地址直接给绝对 URL） */
export async function pullFromRemote(
  remoteUrl: string,
  since: string,
): Promise<SyncPullResult> {
  const res = await fetch(`${remoteUrl.replace(/\/+$/, '')}/api/sync/pull?since=${encodeURIComponent(since)}`);
  if (!res.ok) throw new Error(`远端 pull 失败 (${res.status})`);
  return res.json();
}

export async function pushToRemote(remoteUrl: string, changes: Record<string, unknown[]>) {
  const res = await fetch(`${remoteUrl.replace(/\/+$/, '')}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes }),
  });
  if (!res.ok) throw new Error(`远端 push 失败 (${res.status})`);
  return res.json();
}
