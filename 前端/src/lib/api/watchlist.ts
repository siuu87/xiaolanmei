import { request } from './conversations';
import type { WatchItem } from '@/features/sky/watchListStore';

export type { WatchItem };

export const getWatchlist = () => request<{ items: WatchItem[] }>('/api/watchlist');

/** 整体替换（PUT 全量；本次没出现的条目会在后端打软删墓碑） */
export const putWatchlist = (items: WatchItem[]) =>
  request<{ ok: true }>('/api/watchlist', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
