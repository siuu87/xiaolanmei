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

// ── 心潮本地 Dashboard 的各页（2026-10-20）────────────────

export type XinchaoDashboardPage = 'snapshot' | 'timeline' | 'cabin' | 'personality';

export const getXinchaoDashboard = <T = unknown>(page: XinchaoDashboardPage, query = '') =>
  request<T>(`/api/xinchao/dashboard/${page}${query ? `?${query}` : ''}`);

export interface XinchaoSnapshot {
  revision?: number;
  identity?: { agentName?: string; recipient?: string };
  runtime?: {
    mode?: string;
    consciousness?: string;
    fatigue?: number;
    idleMinutes?: number;
    lastConversationAt?: string | null;
    lastSettledAt?: string | null;
  };
  drives?: { key: string; label: string; short?: string; value: number; percent?: number; level?: string }[];
  topDrives?: { key: string; label: string; value: number }[];
  emotion?: {
    valence?: number;
    arousal?: number;
    label?: string;
    shown?: string;
    updatedAt?: string;
    journal?: { at: string; valence: number; arousal: number; label: string; cause?: string | null; top?: string }[];
    marks?: unknown[];
  };
  thoughts?: { flashCount?: number; obsessionCount?: number; lines?: string[] };
  personality?: { available?: boolean; month?: string | null };
  awareness?: { open?: unknown[]; confirmed?: unknown[] };
}

export interface XinchaoTimelineItem {
  id: string;
  at: string;
  type: string;
  source?: string;
  delta?: { driveDeltas?: Record<string, number> };
  details?: Record<string, unknown>;
}

export interface XinchaoTimeline {
  generatedAt?: string;
  items: XinchaoTimelineItem[];
}

export interface XinchaoCabinNote {
  id: string;
  from?: string;
  content?: string;
  at?: string;
  locked?: boolean;
}

export interface XinchaoCabinLedger {
  id: string;
  amount?: number;
  note?: string;
  at?: string;
}

export interface XinchaoCabin {
  notes?: XinchaoCabinNote[];
  ledger?: XinchaoCabinLedger[];
  totals?: { expense?: number; income?: number; net?: number };
}

export interface XinchaoPersonality {
  available?: boolean;
  source?: string;
  month?: string | null;
  dimensions?: { key?: string; label?: string; value?: number }[];
  anchors?: unknown[];
}
