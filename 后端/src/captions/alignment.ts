/**
 * 对齐适配器链 + 服务端缓存（NEST 滚动字幕接入契约 §6）。
 *
 * ## 适配器是可替换的
 * `AlignmentAdapter` 只有三个成员：名字、能不能处理、去取结果。
 * 想让服务端自己去调厂商（ElevenLabs 字符级 / Deepgram / Groq 词级），
 * 就加一个适配器并把它排在前面 —— **路由和算法都不用动**。
 *
 * ## 密钥只在这里
 * 厂商密钥一律走服务端环境变量；`canHandle()` 在没配密钥时返回 false，
 * 于是整条链会自然落到"带数据来的那一个"，而不是假装成功。
 * 前端只能看到本项目的接口，永远拿不到厂商密钥。
 *
 * ## 缓存键
 * `SHA-256(audioIdentity + "\n" + visibleText)`。**不能只用消息 id**：
 * 正文改一个字、录音重新合成一次，时间轴就错位了。
 * 成功结果与空结果分开设 TTL（空结果短一些，允许上游修好后自动恢复），
 * 同一个键的在途请求用 Map 合并。
 */
import { createHash } from 'node:crypto';
import {
  alignRecognizedWords,
  normalizeAlignment,
  withDefaultConfidence,
  type Alignment,
  type CaptionSource,
  type Cue,
  type ForcedAlignmentResult,
  type RecognizedWord,
} from './core.js';

/* ------------------------------------------------------------------ *
 * 请求 / 适配器契约
 * ------------------------------------------------------------------ */

export interface ProviderPayload {
  /** 字符级强制对齐（ElevenLabs 那种形状） */
  characters?: ForcedAlignmentResult['characters'];
  /** 词级时间戳（Deepgram / Groq 那种形状） */
  words?: RecognizedWord[];
  source?: CaptionSource;
}

export interface AlignmentQuery {
  text: string;
  audioIdentity: string;
  duration: number;
  allowPartial: boolean;
  /** 调用方已经把原始数据带来了 —— 没有厂商密钥时唯一能跑的路径 */
  provider?: ProviderPayload;
}

export interface AlignmentAdapter {
  readonly name: string;
  /** 这次请求能不能交给它。返回 false 就试下一个。 */
  canHandle(query: AlignmentQuery): boolean;
  /** 取对齐结果。返回 null 表示"这份录音确实没有可靠时间轴"，**不是**失败。 */
  align(query: AlignmentQuery, opts: { signal: AbortSignal }): Promise<{ cues: Cue[]; source: CaptionSource } | null>;
}

/**
 * 直通适配器：数据已经在请求里了，只做**校验 + 规范化**。
 *
 * 这条路径不需要任何厂商密钥，所以在配好密钥之前它是唯一能出结果的一环；
 * 它的产出和厂商返回后走的是同一套算法，所以结果形状完全一致。
 */
export const passthroughAdapter: AlignmentAdapter = {
  name: 'passthrough',
  canHandle: (q) => Array.isArray(q.provider?.characters) || Array.isArray(q.provider?.words),
  async align(q) {
    const { provider } = q;
    if (!provider) return null;
    if (Array.isArray(provider.characters) && provider.characters.length) {
      const cues = normalizeAlignment(q.text, { characters: provider.characters });
      return cues ? { cues, source: provider.source ?? 'elevenlabs-forced-alignment' } : null;
    }
    if (Array.isArray(provider.words) && provider.words.length) {
      const source = provider.source ?? 'deepgram-word-timestamps';
      // Groq 的词结果没有逐词置信度 —— 补 1 再进算法（上游 §3 的输入适配）
      const words = source === 'groq-word-timestamps' ? withDefaultConfidence(provider.words) : provider.words;
      const cues = alignRecognizedWords(q.text, words, { allowPartial: q.allowPartial });
      return cues ? { cues, source } : null;
    }
    return null;
  },
};

/**
 * 厂商直连适配器的**接缝**。现在没有配密钥，所以 `canHandle` 恒为 false ——
 * 链会自然落到直通适配器；一旦在 `.env` 里填上 key，它会自动生效。
 *
 * 接上真实厂商时要做的事（别省）：
 *  - 用 `opts.signal` 真正参与取消，并给每次上游调用设超时；
 *  - 只把**音频字节 + 文本**发出去，不要把整条会话/历史带上；
 *  - 按厂商返回决定 source（字符级 → elevenlabs-forced-alignment；词级 → deepgram/groq）。
 */
export function vendorAdapter(name: string, envKeys: string[], _endpoint: string): AlignmentAdapter {
  return {
    name,
    canHandle: () => envKeys.every((k) => !!process.env[k]),
    async align() {
      // 未接线的占位：宁可返回 null（"没有可靠时间轴"），也不要编一份假时间轴出来
      return null;
    },
  };
}

/** 适配器链。加厂商适配器就**插到这个数组前面**。 */
export const ALIGNMENT_ADAPTERS: AlignmentAdapter[] = [
  vendorAdapter('elevenlabs', ['ELEVENLABS_API_KEY'], 'https://api.elevenlabs.io/v1/forced-alignment'),
  vendorAdapter('deepgram', ['DEEPGRAM_API_KEY'], 'https://api.deepgram.com/v1/listen'),
  passthroughAdapter,
];

/* ------------------------------------------------------------------ *
 * 限额（服务端必须自己扛住，不能信前端）
 * ------------------------------------------------------------------ */

export const LIMITS = {
  maxTextChars: 4000,
  maxDurationSeconds: 3600,
  maxProviderItems: 8000,
  maxAudioDataUrlChars: 8 * 1024 * 1024,
} as const;

export function validateQuery(q: Partial<AlignmentQuery>): string | null {
  if (typeof q.text !== 'string' || !q.text.length) return 'text_required';
  if (q.text.length > LIMITS.maxTextChars) return 'text_too_long';
  if (typeof q.audioIdentity !== 'string' || !q.audioIdentity.length) return 'audio_identity_required';
  if (typeof q.duration !== 'number' || !Number.isFinite(q.duration) || q.duration <= 0) return 'bad_duration';
  if (q.duration > LIMITS.maxDurationSeconds) return 'duration_too_long';
  const items = (q.provider?.characters?.length ?? 0) + (q.provider?.words?.length ?? 0);
  if (items > LIMITS.maxProviderItems) return 'provider_items_too_many';
  return null;
}

/* ------------------------------------------------------------------ *
 * 缓存
 * ------------------------------------------------------------------ */

const SUCCESS_TTL = 30 * 60 * 1000;
const EMPTY_TTL = 60 * 1000;
const MAX_ENTRIES = 200;

interface CacheEntry {
  alignment: Alignment | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Alignment | null>>();

export const cacheKey = (audioIdentity: string, text: string) =>
  createHash('sha256').update(`${audioIdentity}\n${text}`).digest('hex');

function trim() {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function readCache(key: string): Alignment | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.alignment;
}

function writeCache(key: string, alignment: Alignment | null) {
  cache.set(key, { alignment, expiresAt: Date.now() + (alignment ? SUCCESS_TTL : EMPTY_TTL) });
  trim();
}

/** 诊断用（验收脚本读它断言在途合并与容量上限） */
export const alignmentCacheStats = () => ({ entries: cache.size, inflight: inflight.size, max: MAX_ENTRIES });
export const clearAlignmentCache = () => {
  cache.clear();
  inflight.clear();
};

/* ------------------------------------------------------------------ *
 * 主入口
 * ------------------------------------------------------------------ */

export interface ResolveResult {
  alignment: Alignment | null;
  cached: boolean;
  reason?: string;
}

/**
 * 走一遍适配器链，命中缓存就直接返回。**从不抛异常** ——
 * 拿不到就返回 `{ alignment: null, reason }`，让调用方走"只估算、不给跳播"的分支。
 */
export async function resolveAlignment(query: AlignmentQuery): Promise<ResolveResult> {
  const key = cacheKey(query.audioIdentity, query.text);

  const cached = readCache(key);
  if (cached !== undefined) return { alignment: cached, cached: true };

  const running = inflight.get(key);
  if (running) return { alignment: await running, cached: false };

  const task = (async (): Promise<Alignment | null> => {
    const adapter = ALIGNMENT_ADAPTERS.find((a) => a.canHandle(query));
    if (!adapter) return null;
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 8000);
    try {
      const got = await adapter.align(query, { signal: ac.signal });
      if (!got) return null;
      return {
        text: query.text,
        audioIdentity: query.audioIdentity,
        duration: query.duration,
        source: got.source,
        cues: got.cues,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(to);
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  const alignment = await task;
  writeCache(key, alignment);
  return {
    alignment,
    cached: false,
    // 拿到结果但为空：说清楚是"没适配器"还是"适配器说这份录音没时间轴"
    reason: alignment ? undefined : ALIGNMENT_ADAPTERS.some((a) => a.canHandle(query)) ? 'no_alignment' : 'no_adapter',
  };
}
