/**
 * 心潮·念（Xinchao·Nian）前端接口（2026-10-20）。
 *
 * 后端已把 SERVICE_TOKEN 藏住，这里只拿裁剪过的字段：
 * - status：心潮在不在 / 版本 / 模式
 * - now：此刻压缩块
 * - state：11 股驱力 + 情绪
 */
import { request } from './conversations';

export interface XinchaoStatus {
  configured: boolean;
  up: boolean;
  url: string | null;
  version?: string;
  mode?: string;
}

export interface XinchaoNow {
  ok: boolean;
  text: string;
  lines: number;
  revision: number;
  generatedAt: string;
}

export interface XinchaoDrive {
  key: string;
  label: string;
  value: number;
}

export interface XinchaoEmotion {
  valence: number;
  arousal: number;
  label: string;
  updatedAt: string;
  lastCause?: string | null;
  lastCauseAt?: string | null;
}

export interface XinchaoState {
  revision: number;
  consciousness: string | null;
  drives: XinchaoDrive[];
  emotion: XinchaoEmotion | null;
  lastSettledAt: string | null;
  thoughtCount: number | null;
}

export const getXinchaoStatus = () => request<XinchaoStatus>('/api/xinchao/status');
export const getXinchaoNow = () => request<XinchaoNow>('/api/xinchao/now');
export const getXinchaoState = () => request<XinchaoState>('/api/xinchao/state');
