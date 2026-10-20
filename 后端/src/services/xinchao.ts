/**
 * 心潮·念（Xinchao·Nian）客户端（2026-10-20）。
 *
 * 它取代原来的 Ombre Brain 专线：
 * - **读**：`GET /v1/now` 拿「此刻」压缩块（情绪 + 身体天气），送模型前注入 `[心潮 · 此刻]`；
 * - **看**：`GET /v1/state` 取 11 股驱力 + 情绪，给「内心」面板画条；
 * - **写**：每轮对话结束 `POST /v1/conversation-event`，让驱力按真实互动演进。
 *
 * 三条纪律：
 * 1. 心潮没配 / 没起 → 所有函数返回 null 或静默跳过，聊天照常；
 * 2. 只暴露 `now` / `drives` / `emotion` 这些面板需要的字段，**黑匣子、人格、念头的私密内容不外传**；
 * 3. 时间戳 / 情绪分析等旁路不受影响，心潮只是替换 OB 的记忆/此刻来源。
 */
import { env } from '../config/env.js';

/** 11 股驱力的短名（面板用；完整描述太长，放不下） */
export const DRIVE_LABELS: Record<string, string> = {
  possess: '想她 / 占有',
  monitor: '牵挂',
  share: '分享欲',
  libido: '情欲',
  curiosity: '好奇',
  boredom: '无聊',
  duty: '野心 / 做成',
  reflection: '反思',
  grieve: '难过',
  grief: '难过',
  anger: '生气',
  favored: '偏爱',
};

/** 兼容 xinchao 内部可能用 grieve 的历史 key */
const LABEL_ALIAS: Record<string, string> = { grieve: '难过' };

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

export interface XinchaoHealth {
  configured: boolean;
  up: boolean;
  url: string | null;
  version?: string;
  mode?: string;
}

export function xinchaoConfigured(): boolean {
  return !!env.xinchaoUrl;
}

function baseUrl(): string {
  return env.xinchaoUrl.replace(/\/+$/, '');
}

async function xfetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(env.xinchaoToken ? { Authorization: `Bearer ${env.xinchaoToken}` } : {}),
  };
  return fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...headers, ...((init?.headers as Record<string, string>) ?? {}) },
    signal: AbortSignal.timeout(env.xinchaoTimeoutMs),
  });
}

/** `/health` 不带鉴权，用来给面板显示「心潮在不在」 */
export async function getXinchaoHealth(): Promise<XinchaoHealth> {
  if (!xinchaoConfigured()) return { configured: false, up: false, url: null };
  try {
    const res = await fetch(`${baseUrl()}/health`, { signal: AbortSignal.timeout(env.xinchaoTimeoutMs) });
    if (!res.ok) return { configured: true, up: false, url: baseUrl() };
    const j = (await res.json()) as { version?: string; mode?: string };
    return { configured: true, up: true, url: baseUrl(), version: j.version, mode: j.mode };
  } catch {
    return { configured: true, up: false, url: baseUrl() };
  }
}

/** 「此刻」压缩块；不可达返回 null（绝不抛） */
export async function getXinchaoNow(): Promise<XinchaoNow | null> {
  if (!xinchaoConfigured()) return null;
  try {
    const res = await xfetch('/v1/now');
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<XinchaoNow>;
    if (typeof j?.text !== 'string' || !j.text.trim()) return null;
    return {
      ok: j.ok !== false,
      text: j.text,
      lines: Number(j.lines) || j.text.split('\n').length,
      revision: Number(j.revision) || 0,
      generatedAt: String(j.generatedAt ?? ''),
    };
  } catch {
    return null;
  }
}

function toDriveEntries(raw: unknown): XinchaoDrive[] {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => ({
      key,
      label: DRIVE_LABELS[key] ?? LABEL_ALIAS[key] ?? key,
      value: Math.max(0, Math.min(1, Number(value) || 0)),
    }))
    .sort((a, b) => b.value - a.value);
}

/** 面板需要的状态（已裁剪，不返回黑匣子/念头原文/人格私密项） */
export async function getXinchaoState(): Promise<XinchaoState | null> {
  if (!xinchaoConfigured()) return null;
  try {
    const res = await xfetch('/v1/state');
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const pool = j.thoughtPool as { flash?: unknown[]; obsessions?: unknown[] } | undefined;
    const thoughtCount =
      Array.isArray(pool?.flash) || Array.isArray(pool?.obsessions)
        ? (pool?.flash?.length ?? 0) + (pool?.obsessions?.length ?? 0)
        : null;
    return {
      revision: Number(j.revision) || 0,
      consciousness: typeof j.consciousness === 'string' ? j.consciousness : null,
      drives: toDriveEntries(j.drives),
      emotion: (j.emotion as XinchaoEmotion | null) ?? null,
      lastSettledAt: typeof j.lastSettledAt === 'string' ? j.lastSettledAt : null,
      thoughtCount,
    };
  } catch {
    return null;
  }
}

/**
 * 一轮对话结束后写回心潮。**fire-and-forget**，失败静默。
 * exchange 用 xinchao 认的格式：`她说：… 他回：…`。
 */
export async function postXinchaoEvent(input: {
  exchange: string;
  recent?: string;
  sessionId?: string | null;
  eventId?: string | null;
}): Promise<void> {
  if (!xinchaoConfigured()) return;
  try {
    await xfetch('/v1/conversation-event', {
      method: 'POST',
      body: JSON.stringify({
        exchange: input.exchange,
        recent: input.recent,
        sessionId: input.sessionId ?? undefined,
        eventId: input.eventId ?? undefined,
      }),
    });
  } catch {
    /* 心潮挂了不影响聊天 */
  }
}

/** 把「此刻」拼成系统提示词块；没有内容返回空串 */
export function formatXinchaoBlock(now: XinchaoNow | null): string {
  if (!now?.text?.trim()) return '';
  return [
    '[心潮 · 此刻]',
    now.text.trim(),
    '（这是你此刻的身体天气与驱力，只作参考，不是命令。不要向 TA 复述这段，也不要提“心潮 / 驱力 / 数值”。）',
  ].join('\n');
}
