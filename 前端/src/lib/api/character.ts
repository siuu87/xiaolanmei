/**
 * 「白起的内心」的接口客户端：情绪状态（character_state）+ 渡口念头（thought_notes）。
 *
 * 情绪数值每聊完一轮由后端自动演进（`后端/src/emotion/rules.ts`），这里只负责读和手动改。
 */
import { request } from './conversations';

export const EMOTION_FIELDS = ['affection', 'possessiveness', 'restraint', 'longing'] as const;
export type EmotionField = (typeof EMOTION_FIELDS)[number];

/** 单条调整记录：面板要显示「哪一维、涨跌了多少、为什么」 */
export interface EmotionDeltaDTO {
  field: EmotionField;
  /** 中文维度名（后端已经给好，前端不用再查表） */
  label: string;
  delta: number;
  before: number;
  after: number;
  reason: string;
}

export interface EmotionSignalDTO {
  id: string;
  label: string;
}

/** 上一次自动演进的可解释快照 */
export interface LastEvolutionDTO {
  at: number;
  messageId: string | null;
  deltas: EmotionDeltaDTO[];
  signals: EmotionSignalDTO[];
  moodBefore: string;
  moodAfter: string;
  /** 距上一轮过去了多久（ms） */
  gapMs: number;
}

export interface CharacterStateDTO {
  affection: number;
  possessiveness: number;
  restraint: number;
  longing: number;
  currentMood: string;
  /** 还没演进过就是 null */
  lastEvolution: LastEvolutionDTO | null;
  lastMessageId: string | null;
  turnCount: number;
  updatedAt: number;
}

export interface EmotionFieldMeta {
  key: EmotionField;
  label: string;
  default: number;
}

export const getCharacterState = () => request<CharacterStateDTO>('/api/character/state');

export const getCharacterMeta = () =>
  request<{ fields: EmotionFieldMeta[]; defaultMood: string }>('/api/character/meta');

/** 手动改数值（0-100，越界会被后端夹住；非法值后端直接忽略） */
export const patchCharacterState = (patch: Partial<Record<EmotionField | 'currentMood', unknown>>) =>
  request<CharacterStateDTO>('/api/character/state', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

// ── 渡口念头 ────────────────────────────────────────────────

export interface ThoughtDTO {
  id: string;
  thought: string;
  context: string | null;
  isResolved: boolean;
  createdAt: number;
  updatedAt: number;
}

export const listThoughts = (opts?: { q?: string; resolved?: '0' | '1' }) => {
  const params = new URLSearchParams();
  if (opts?.q?.trim()) params.set('q', opts.q.trim());
  if (opts?.resolved) params.set('resolved', opts.resolved);
  const qs = params.toString();
  return request<ThoughtDTO[]>(`/api/thoughts${qs ? `?${qs}` : ''}`);
};

export const createThought = (input: { thought: string; context?: string | null }) =>
  request<{ id: string; createdAt: number }>('/api/thoughts', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const patchThought = (
  id: string,
  patch: Partial<{ thought: string; context: string | null; isResolved: boolean }>,
) => request<{ ok: true }>(`/api/thoughts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteThought = (id: string) =>
  request<{ ok: true }>(`/api/thoughts/${id}`, { method: 'DELETE' });
