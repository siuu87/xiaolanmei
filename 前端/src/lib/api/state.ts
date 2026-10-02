import { request } from './conversations';

/** 心潮状态快照：data 为心潮 /v1/state 的原始返回（字段待定，先透传）。 */
export interface StateSnapshot {
  ts: number;
  degraded: boolean;
  data: unknown;
}

/** 读取心潮（对方）的实时状态。 */
export const fetchState = () => request<StateSnapshot>('/api/state');
