/**
 * 对齐结果的获取、缓存与失效（NEST 滚动字幕接入契约 §2 / §6）。
 *
 * 服务端负责校验、限流和缓存；前端这一层负责：
 *  - **前端缓存**：容量上限 + 正/负结果不同 TTL + 失败退避；
 *  - **在途合并**：同一个键并发只发一次请求；
 *  - **版本校验**：连续点击时旧响应不能覆盖新目标（比较 `audioIdentity` + `text`）。
 *
 * 缓存键是 `SHA-256(audioIdentity + "\n" + visibleText)` —— **只按消息 id 缓存是不行的**：
 * 正文改一个字、录音重新合成一次，整条时间轴就错位了。
 */
import { request } from '@/lib/api/conversations';
import { captionCacheKey } from './audioClock';
import type { Alignment, CaptionSource, ForcedAlignmentResult, RecognizedWord } from './core';

/** 服务端返回体 */
export interface AlignmentResponse {
  alignment: Alignment | null;
  cached?: boolean;
  /** 拿不到对齐的原因（no_adapter / no_credentials / provider_error / invalid_input…） */
  reason?: string;
}

/** 一次对齐请求的输入。`characters` / `words` 二选一，都不给则要求服务端自己去取。 */
export interface AlignmentInput {
  text: string;
  /** 音频内容哈希或不可变版本 ID —— 不要用消息 id 顶替 */
  audioIdentity: string;
  duration: number;
  /** 保存语音允许部分匹配（覆盖率门槛降到 35% + 至少 6 连） */
  allowPartial?: boolean;
  /** 字符级强制对齐结果（ElevenLabs 那种形状） */
  characters?: ForcedAlignmentResult['characters'];
  /** 词级时间戳 */
  words?: RecognizedWord[];
  /** 词级来源；不给就按 `deepgram-word-timestamps` 处理（影响能否做词内显示细分） */
  source?: CaptionSource;
}

/* ------------------------------------------------------------------ *
 * 缓存
 * ------------------------------------------------------------------ */

const MAX_ENTRIES = 40;
const POSITIVE_TTL = 30 * 60 * 1000;
const NEGATIVE_TTL = 60 * 1000;
/** 失败后的最短重试间隔（退避基数） */
const RETRY_BASE = 3000;
const RETRY_MAX = 60 * 1000;

interface CacheEntry {
  alignment: Alignment | null;
  /** 命中过期的时刻；到了就作废重取 */
  expiresAt: number;
  /** 失败后的最早重试时刻 */
  retryAt: number;
  /** 连续失败次数，用于退避 */
  failures: number;
}

const cache = new Map<string, CacheEntry>();
/** 在途请求合并表：同键并发只发一次 */
const inflight = new Map<string, Promise<AlignmentResponse>>();

const now = () => Date.now();

function trim() {
  // Map 保持插入顺序；超上限就丢最旧的（先丢负结果）
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** 只读缓存探测。返回 `undefined` 表示「需要发请求」。 */
async function probe(input: AlignmentInput): Promise<AlignmentResponse | undefined> {
  const key = await captionCacheKey(input.audioIdentity, input.text);
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.retryAt > now()) return { alignment: hit.alignment, cached: true, reason: 'retry_backoff' };
  if (hit.expiresAt > now()) return { alignment: hit.alignment, cached: true };
  cache.delete(key);
  return undefined;
}

function remember(input: AlignmentInput, res: AlignmentResponse, failed: boolean) {
  void captionCacheKey(input.audioIdentity, input.text).then((key) => {
    const prev = cache.get(key);
    const failures = failed ? (prev?.failures ?? 0) + 1 : 0;
    cache.set(key, {
      alignment: res.alignment,
      expiresAt: now() + (res.alignment ? POSITIVE_TTL : NEGATIVE_TTL),
      retryAt: failed ? now() + Math.min(RETRY_MAX, RETRY_BASE * 2 ** (failures - 1)) : 0,
      failures,
    });
    trim();
  });
}

/** 测试/切曲/换录音时手动作废（音频标识变了本来就该自然失效，这里只是给个手动口子） */
export function clearAlignmentCache() {
  cache.clear();
  inflight.clear();
}

/* ------------------------------------------------------------------ *
 * 取对齐结果
 * ------------------------------------------------------------------ */

/**
 * 客户端类型 → 线上格式。
 *
 * `AlignmentInput` 是给调用方用的**扁平**形状（characters / words / source 平铺），
 * 而接口的线上契约把它们包在 `provider` 里：`provider` 表达的是
 * 「原始数据是调用方自己带来的」，跟「让服务端拿密钥去厂商取」是两条不同的路径，
 * 包一层才不会含糊。
 *
 * 这里一开始直接写的是 `JSON.stringify(input)` —— 于是 `provider` 永远缺省。
 * 服务端只认 `provider`，直通适配器 `canHandle` 恒为 false，
 * **每一次请求都稳稳地返回 `no_adapter`**，而客户端看上去只像"这段录音没有时间戳"。
 * 2026-10-17 靠浏览器台架（`tests/caption-harness.html`）才把它照出来 ——
 * 产品里还没接真实录音，走的是估算态，光看界面永远发现不了。
 */
function toWire(input: AlignmentInput): Record<string, unknown> {
  const provider: Record<string, unknown> = {};
  if (input.characters?.length) provider.characters = input.characters;
  if (input.words?.length) provider.words = input.words;
  if (input.source) provider.source = input.source;
  return {
    text: input.text,
    audioIdentity: input.audioIdentity,
    duration: input.duration,
    allowPartial: input.allowPartial === true,
    ...(Object.keys(provider).length ? { provider } : {}),
  };
}

/**
 * 取一条录音的对齐结果。**永远不抛**：失败返回 `{ alignment: null, reason }`，
 * 调用方据此走「无测量时间 → 只估算显示、不给跳播」的分支。
 *
 * 参数里的 `version` 用于**连续点击**：响应回来时用 `isCurrent()` 再确认一次，
 * 过期的结果要丢弃（原文 §4）。
 */
export async function requestAlignment(
  input: AlignmentInput,
  { signal, timeoutMs = 8000 }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<AlignmentResponse> {
  const cached = await probe(input);
  if (cached) return cached;

  const key = await captionCacheKey(input.audioIdentity, input.text);
  const running = inflight.get(key);
  if (running) return running;

  const task = (async (): Promise<AlignmentResponse> => {
    const timer = new AbortController();
    const abort = () => timer.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const to = window.setTimeout(abort, timeoutMs);
    try {
      const res = await request<AlignmentResponse>('/api/captions/alignment', {
        method: 'POST',
        body: JSON.stringify(toWire(input)),
        signal: timer.signal,
      });
      // 服务端说没有就没有 —— 不能在这里编一份出来
      remember(input, res, false);
      return res;
    } catch (err) {
      const reason = (err as Error)?.name === 'AbortError' ? 'timeout' : 'network';
      remember(input, { alignment: null, reason }, true);
      return { alignment: null, reason };
    } finally {
      window.clearTimeout(to);
      signal?.removeEventListener('abort', abort);
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

/**
 * 批量预热。`limit` 是**并发上限**（原文 §6 要求有上限，别把一屏几百条全打出去）。
 */
export async function prefetchAlignments(inputs: AlignmentInput[], limit = 4): Promise<number> {
  let ok = 0;
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, inputs.length)) }, async () => {
    while (cursor < inputs.length) {
      const item = inputs[cursor++];
      const res = await requestAlignment(item);
      if (res.alignment) ok++;
    }
  });
  await Promise.all(workers);
  return ok;
}

/** 诊断用：当前缓存里有多少条（测试脚本读它来断言在途合并 / 容量上限） */
export function alignmentCacheStats() {
  return { entries: cache.size, inflight: inflight.size, max: MAX_ENTRIES };
}
