import { request } from './conversations';

/**
 * 通话记录。挂断时 POST 一条；聊天流里那张内联卡片走消息自己那条路（meta.call），
 * 两者指向同一次通话 —— 时长以本接口返回的 seconds 为准。
 */

export type CallKind = 'voice' | 'video';
export type CallState = 'answered' | 'declined' | 'missed';

export interface CallDTO {
  id: string;
  conversationId: string | null;
  kind: CallKind;
  state: CallState;
  seconds: number;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
}

export interface CallStats {
  total: number;
  answered: number;
  totalSeconds: number;
  voiceSeconds: number;
  videoSeconds: number;
  lastCallAt: number | null;
}

export interface CallInput {
  kind: CallKind;
  state: CallState;
  seconds?: number;
  conversationId?: string | null;
  startedAt?: number;
  endedAt?: number;
}

export const listCalls = (conversationId?: string) =>
  request<CallDTO[]>(`/api/calls${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`);

export const callStats = () => request<CallStats>('/api/calls/stats');

export const createCall = (input: CallInput) =>
  request<{ id: string; seconds: number; state: CallState }>('/api/calls', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const deleteCall = (id: string) => request<{ ok: true }>(`/api/calls/${id}`, { method: 'DELETE' });

/** mm:ss（时长展示统一走这里，别各处再写一遍 padStart） */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
