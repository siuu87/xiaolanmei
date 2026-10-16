/**
 * 逐字字幕的对齐接口（NEST 滚动字幕接入契约 §5 / §6）。
 *
 * 两个入口：
 *  - `POST /api/captions/alignment` —— 保存回放：提交**可见文本 + 音频标识 + 时长**，
 *    服务端负责校验、限额、缓存，并在配了厂商密钥时自己去取时间戳。
 *  - `POST /api/captions/chunks` —— 流式片段：一片音频问一次字幕，返回可能为 `null`。
 *  - `GET  /api/captions/health` —— 哪些适配器是活的（界面据此决定要不要请求）。
 *
 * **三条硬要求**（原文 §6 / §10）：
 *  1. 厂商密钥只在服务端环境变量里，前端只能看到本项目的接口；
 *  2. 拿不到就说拿不到 —— 返回 `alignment: null` + `reason`，**绝不编造时间轴**；
 *  3. 缓存键是 `SHA-256(audioIdentity + "\n" + text)`，不是消息 id。
 */
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import {
  ALIGNMENT_ADAPTERS,
  LIMITS,
  alignmentCacheStats,
  clearAlignmentCache,
  validateQuery,
  type AlignmentQuery,
  type ProviderPayload,
} from '../captions/alignment.js';
import { resolveAlignment } from '../captions/alignment.js';
import { CAPTION_SOURCES, type CaptionSource } from '../captions/core.js';

/** 只接受已知来源标识，别把任意字符串当 source 存进缓存键的语义里 */
function normSource(v: unknown): CaptionSource | undefined {
  return typeof v === 'string' && (CAPTION_SOURCES as readonly string[]).includes(v)
    ? (v as CaptionSource)
    : undefined;
}

function normProvider(raw: unknown): ProviderPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as ProviderPayload;
  const out: ProviderPayload = {};
  if (Array.isArray(p.characters)) out.characters = p.characters;
  if (Array.isArray(p.words)) out.words = p.words;
  const src = normSource(p.source);
  if (src) out.source = src;
  return out.characters || out.words ? out : undefined;
}

/**
 * 请求体里的对齐原始数据。**两种写法都收**：
 *  - 规范写法：`{ provider: { characters | words, source } }`
 *  - 简写：`characters` / `words` / `source` 平铺在顶层
 *
 * 容忍简写是因为客户端的 `AlignmentInput` 天生是扁平的，一路 `JSON.stringify` 过来很顺手；
 * 而只认 `provider` 的话，写错的那一方**不会收到任何报错**，只会每次都拿到 `no_adapter`
 * —— 看起来像"这段录音没有时间轴"，而不是"参数写错了"。
 * 2026-10-17 真踩过一次（前端就是这么发的），所以宁可在这里多认一种形状。
 */
function readProvider(raw: unknown): ProviderPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const body = raw as Record<string, unknown>;
  const nested = normProvider(body.provider);
  if (nested) return nested;
  const flat: ProviderPayload = {};
  if (Array.isArray(body.characters)) flat.characters = body.characters as ProviderPayload['characters'];
  if (Array.isArray(body.words)) flat.words = body.words as ProviderPayload['words'];
  const src = normSource(body.source);
  if (src) flat.source = src;
  return flat.characters || flat.words ? flat : undefined;
}

export async function captionRoutes(app: FastifyInstance): Promise<void> {
  /**
   * 有哪些适配器是活的。界面可以先问一次：
   * 如果服务端自己取不了时间戳（`vendorConfigured: false`），
   * 那就只有在请求里**自带** `provider` 才可能拿到对齐结果，
   * 别为了字幕多发一堆注定返回 null 的请求。
   */
  app.get('/captions/health', async () => {
    // 探测要带上一份"形状完整的数据"，否则 passthrough 会因为"这次没带数据"而被误报成不可用。
    const probe = {
      text: 'x',
      audioIdentity: 'x',
      duration: 1,
      allowPartial: false,
      provider: { words: [{ word: 'x', start: 0, end: 1, confidence: 1 }] },
    };
    const adapters = ALIGNMENT_ADAPTERS.map((a) => ({
      name: a.name,
      /** 厂商直连 = 服务端自己去取；passthrough = 请求里带数据才工作 */
      role: a.name === 'passthrough' ? ('passthrough' as const) : ('vendor' as const),
      available: a.canHandle(probe),
    }));
    return {
      adapters,
      /** 服务端自己能不能去取时间戳（现在为 false：没配任何厂商密钥） */
      vendorConfigured: adapters.some((a) => a.role === 'vendor' && a.available),
      limits: LIMITS,
      cache: alignmentCacheStats(),
    };
  });

  app.post('/captions/alignment', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const query: AlignmentQuery = {
      text: typeof body.text === 'string' ? body.text : '',
      audioIdentity: typeof body.audioIdentity === 'string' ? body.audioIdentity : '',
      duration: typeof body.duration === 'number' ? body.duration : 0,
      allowPartial: body.allowPartial === true,
      provider: readProvider(body),
    };
    const bad = validateQuery(query);
    if (bad) {
      reply.code(400);
      return { alignment: null, cached: false, reason: bad };
    }
    return resolveAlignment(query);
  });

  /**
   * 流式片段的字幕。
   *
   * 请求形状照原文 §5 的示例（`audio_data_url` + `text` + `duration`）。
   * 额外允许带上 `provider` —— 与 alignment 同理，没有密钥时这是唯一能出结果的路。
   *
   * 返回 `{ captions: Cue[] | null }`。**片段字幕晚到是常态**：
   * 调用方拿到结果后要再确认一次 generation 归属，过期就丢。
   */
  app.post('/captions/chunks', async (req, reply) => {
    const body = (req.body ?? {}) as {
      audio_data_url?: unknown;
      text?: unknown;
      duration?: unknown;
      provider?: unknown;
      source?: unknown;
    };
    const audioDataUrl = typeof body.audio_data_url === 'string' ? body.audio_data_url : '';
    const text = typeof body.text === 'string' ? body.text : '';
    const duration = typeof body.duration === 'number' ? body.duration : 0;

    if (!text) {
      reply.code(400);
      return { captions: null, reason: 'text_required' };
    }
    if (audioDataUrl.length > LIMITS.maxAudioDataUrlChars) {
      reply.code(413);
      return { captions: null, reason: 'audio_too_large' };
    }
    // 只做形状校验，不解析音频：本机没有解码器，也不该在这一层碰用户音频
    const mimeOk = /^data:audio\/[\w.+-]+(;[^,]*)?,/i.test(audioDataUrl);
    if (audioDataUrl && !mimeOk) {
      reply.code(400);
      return { captions: null, reason: 'bad_audio_data_url' };
    }
    if (duration > LIMITS.maxDurationSeconds) {
      reply.code(400);
      return { captions: null, reason: 'duration_too_long' };
    }

    /**
     * 片段标识 = **音频内容哈希**。
     *
     * 一开始这里写的是 `chunk:${audioDataUrl.length}:${duration}` —— 那是错的：
     * 两段不同的录音只要字节长度和时长凑巧相同，就会共用一条缓存，
     * 把 A 片段的字幕安到 B 片段上（2026-10-17 实测被这条咬到）。
     * 原文 §6 也明确写了键要用 `SHA-256(audioDataURL + "\n" + visibleText)`。
     */
    const audioIdentity = `chunk:${createHash('sha256').update(audioDataUrl).digest('hex')}`;
    const query: AlignmentQuery = {
      text,
      audioIdentity,
      duration: duration > 0 ? duration : 1,
      allowPartial: true,
      provider: readProvider(body),
    };
    const res = await resolveAlignment(query);
    return { captions: res.alignment?.cues ?? null, cached: res.cached, reason: res.reason };
  });

  /** 只给本地验收用：清缓存，好在同一次跑批里观察"未命中 → 命中"的差别 */
  app.post('/captions/cache/clear', async () => {
    clearAlignmentCache();
    return { ok: true };
  });
}
