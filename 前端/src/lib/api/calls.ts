import { request } from './conversations';

/**
 * 通话记录。挂断时 POST 一条；聊天流里那张内联卡片走消息自己那条路（meta.call），
 * 两者指向同一次通话 —— 时长以本接口返回的 seconds 为准。
 */

export type CallKind = 'voice' | 'video';
export type CallState = 'answered' | 'declined' | 'missed';
export type CallDirection = 'outgoing' | 'incoming';

export interface CallDTO {
  id: string;
  conversationId: string | null;
  kind: CallKind;
  state: CallState;
  direction: CallDirection | null;
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
  direction?: CallDirection | null;
  seconds?: number;
  conversationId?: string | null;
  startedAt?: number;
  endedAt?: number;
}

/**
 * 通话状态的归属文案：declined / missed 必须结合 direction 才能说清是「我」还是「他」的动作。
 * - answered：已接通（不分方向）
 * - declined + outgoing：我打过去，我取消了 → 已取消
 * - declined + incoming：他打过来，我拒接了 → 已拒接
 * - missed + outgoing：我打过去，他没接 → 对方未接
 * - missed + incoming：他打过来，我没接 → 未接来电
 * 老数据 direction 为 null 时按 incoming 显示（对齐旧 UI 的「未接来电 / 已拒接」）。
 */
export function callStatusWord(call: { direction?: CallDirection | null; state: CallState }): string {
  const dir = call.direction ?? 'incoming';
  if (call.state === 'answered') return '已接通';
  if (call.state === 'declined') return dir === 'outgoing' ? '已取消' : '已拒接';
  return dir === 'outgoing' ? '对方未接' : '未接来电';
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
