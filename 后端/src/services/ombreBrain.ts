/**
 * Ombre Brain（OB）记忆专线（2026-10-19）—— 阿里云 VPS 上的独立记忆服务。
 *
 * 协议（需求给定）：
 * - 前置检索：`POST {OB_BASE_URL}/api/memory/query`
 *   body `{ query, limit: 3, threshold: 0.4 }`
 * - 后置归档：`POST {OB_BASE_URL}/api/memory/append`
 *   body `{ summary, timestamp }`
 * - 鉴权：`Authorization: Bearer ${OB_API_TOKEN}`
 *
 * **三条纪律**：
 * 1. **没有配置就整条链路消失**：`OB_BASE_URL` 为空 / 还是占位符 `<VPS_IP>` → 直接返回空，
 *    聊天行为与以前完全一致。
 * 2. **绝不阻塞界面**：检索有 3.5s 超时，超时就当没检索到；归档是 fire-and-forget，
 *    调用方 `void obAppend(...)` 即可。
 * 3. **响应格式宽容**：OB 不同版本的返回可能是数组 / `{results}` / `{memories}` / `{data}`，
 *    这里统一归一成 `ObMemoryHit[]`，字段名也兼容 content/text/memory/summary/anchor。
 */
import { env } from '../config/env.js';

export interface ObMemoryHit {
  content: string;
  /** 相似度（有的版本叫 score / similarity / distance），没有就 null */
  score: number | null;
}

const PLACEHOLDER = /<[^>]+>/;

/** OB 是否已配置（空、占位符、非 http(s) 都算没配） */
export function obConfigured(): boolean {
  const base = env.obBaseUrl;
  if (!base) return false;
  if (PLACEHOLDER.test(base)) return false;
  return /^https?:\/\//i.test(base);
}

function endpoint(path: string): string {
  return `${env.obBaseUrl.replace(/\/+$/, '')}${path}`;
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(env.obApiToken ? { Authorization: `Bearer ${env.obApiToken}` } : {}),
  };
}

async function obPost(path: string, body: unknown): Promise<Response> {
  return fetch(endpoint(path), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(env.obTimeoutMs),
  });
}

/** 把 OB 的各种返回形状归一成命中列表 */
export function normalizeHits(data: unknown): ObMemoryHit[] {
  let arr: unknown[] = [];
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const candidate = o.results ?? o.memories ?? o.items ?? o.data ?? o.hits;
    if (Array.isArray(candidate)) arr = candidate;
  }

  const out: ObMemoryHit[] = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      const s = item.trim();
      if (s) out.push({ content: s.slice(0, 400), score: null });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const content = [o.content, o.text, o.memory, o.summary, o.anchor, o.value]
      .find((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (!content) continue;
    const score = [o.score, o.similarity, o.distance].find(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
    out.push({ content: content.trim().slice(0, 400), score: score ?? null });
  }

  // 去重（OB 有时会把同一锚点不同片段都返回来）
  const seen = new Set<string>();
  return out.filter((h) => {
    const key = h.content.replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 前置检索：拿用户当前输入去 OB 捞 3 条记忆锚点。
 * **永远不抛**：不可达 / 非 200 / 超时 → 空数组。
 */
export async function obQuery(
  query: string,
  opts: { limit?: number; threshold?: number } = {},
): Promise<ObMemoryHit[]> {
  const q = (query ?? '').trim();
  if (!obConfigured() || !q) return [];
  try {
    const res = await obPost('/api/memory/query', {
      query: q.slice(0, 800),
      limit: opts.limit ?? 3,
      threshold: opts.threshold ?? 0.4,
    });
    if (!res.ok) {
      console.warn(`[OB] 检索失败 ${res.status}`);
      return [];
    }
    return normalizeHits(await res.json());
  } catch (err) {
    console.warn('[OB] 检索不可达，本轮跳过：', (err as Error).message);
    return [];
  }
}

/**
 * 后置归档：本轮互动摘要 + 情感波动写回 OB。
 * 调用方 `void obAppend(...)` 即可，不阻塞 SSE 结束。
 */
export async function obAppend(summary: string, timestamp: number = Date.now()): Promise<boolean> {
  const s = (summary ?? '').trim();
  if (!obConfigured() || !s) return false;
  try {
    const res = await obPost('/api/memory/append', { summary: s.slice(0, 1200), timestamp });
    if (!res.ok) {
      console.warn(`[OB] 归档失败 ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[OB] 归档不可达：', (err as Error).message);
    return false;
  }
}

/** 把检索结果拼成注入主模型的 `[记忆回想]` 段 */
export function buildObMemoryBlock(hits: ObMemoryHit[]): string {
  if (!hits.length) return '';
  return [
    '[记忆回想]',
    '以下是从长期记忆里想起的旧事，和这轮对话可能有关；无关就自然忽略，不要逐条复述，也不要说「根据记忆」。',
    ...hits.map((h, i) => `${i + 1}. ${h.content}`),
  ].join('\n');
}

/* ───────────────────────── 本轮摘要 ───────────────────────── */

export interface TurnSummaryInput {
  userText: string;
  replyText: string;
  moodLabel: string;
  delta?: { jealousy: number; tension: number; vulnerability: number; restraint: number };
}

function compact(text: string, max: number): string {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

const DELTA_LABELS: [keyof NonNullable<TurnSummaryInput['delta']>, string][] = [
  ['jealousy', '醋意'],
  ['tension', '紧绷'],
  ['vulnerability', '委屈'],
  ['restraint', '克制'],
];

function formatDelta(delta: TurnSummaryInput['delta']): string {
  if (!delta) return '';
  return DELTA_LABELS.filter(([k]) => Math.abs(delta[k]) >= 0.05)
    .map(([k, label]) => {
      const v = delta[k];
      return `${label}${v > 0 ? '+' : ''}${v.toFixed(1)}`;
    })
    .join('、');
}

/**
 * 本地拼「本轮核心互动摘要与情感波动」。
 * 不用再调一次模型 —— 归档是后置旁路，省一次 token，也不怕模型挂掉。
 */
export function composeTurnSummary(input: TurnSummaryInput): string {
  const u = compact(input.userText, 90);
  const r = compact(input.replyText, 140);
  if (!u && !r) return '';
  const lines = [
    `TA：${u || '（无文字）'}`,
    `白起：${r || '（无文字）'}`,
    `心绪：${input.moodLabel || '平静'}`,
  ];
  const d = formatDelta(input.delta);
  if (d) lines.push(`情感波动：${d}`);
  return lines.join('\n');
}

/** 给前端 / 排查用的状态（不吐 token、不吐完整 Base URL） */
export function obStatus(): { configured: boolean; tokenSet: boolean; timeoutMs: number } {
  return {
    configured: obConfigured(),
    tokenSet: !!env.obApiToken,
    timeoutMs: env.obTimeoutMs,
  };
}
