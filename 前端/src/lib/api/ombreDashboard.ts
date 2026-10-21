/**
 * Ombre Brain Dashboard（OB 记忆中枢）前端接口（2026-10-21）。
 *
 * 后端已代持 Dashboard 密码会话，这里只拿本地代理裁剪过的字段。
 * 复用 xinchao 同款的 `request` 包装（401/网络错误统一抛出，由调用方 try/catch）。
 */
import { request } from './conversations';

export type OmbreBucketState = 'dynamic' | 'permanent' | 'pinned' | 'archived';

export interface OmbreBucket {
  id: string;
  name: string;
  type: string;
  pinned: boolean;
  resolved: boolean;
  archived: boolean;
  domain: string[];
  tags: string[];
  valence: number;
  arousal: number;
  importance: number;
  score: number;
  created?: string;
  lastActive?: string;
  contentPreview: string;
  whyRemembered?: string;
  state: OmbreBucketState;
  raw: Record<string, unknown>;
}

export interface OmbreStatus {
  configured: boolean;
  up: boolean;
  url: string | null;
  total: number;
  dynamic: number;
  permanent: number;
  pinned: number;
  resolved: number;
  error?: string;
}

export type BucketStateFilter = 'all' | OmbreBucketState;
export type BucketSort = 'score' | 'created_desc' | 'created_asc';

export interface BucketListResult {
  buckets: OmbreBucket[];
  count: number;
}

export const getOmbreStatus = () => request<OmbreStatus>('/api/ombre-dashboard/status');

export const getOmbreBuckets = (params: { type?: 'dynamic' | 'permanent'; state?: BucketStateFilter; sort?: BucketSort } = {}) => {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.state && params.state !== 'all') qs.set('state', params.state);
  if (params.sort && params.sort !== 'score') qs.set('sort', params.sort);
  const q = qs.toString();
  return request<BucketListResult>(`/api/ombre-dashboard/buckets${q ? `?${q}` : ''}`);
};

export const searchOmbreBuckets = (q: string) =>
  request<BucketListResult>(`/api/ombre-dashboard/search?q=${encodeURIComponent(q)}`);

export const getOmbreBucket = (id: string) => request<OmbreBucket>(`/api/ombre-dashboard/buckets/${id}`);
