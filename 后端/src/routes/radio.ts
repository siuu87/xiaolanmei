import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { radioAssets } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import { getAdapterConfig, getModelConfig } from './stations.js';
import { parseRadioScript, type RadioChannel } from '../radio/parse.js';
import {
  RADIO_CHANNELS,
  fallbackRadioScript,
  radioChannelPrompt,
  radioUserContext,
} from '../radio/prompt.js';

/**
 * 深夜电台（MIDNIGHT FM，2026-10-19）。
 *
 * - `GET  /radio/channels` 四个台的元信息（频率/名字/是否关灯/是否隐藏）
 * - `GET  /radio/assets`   开场 / BGM / 音效 / drama 素材（音频 URL 走 /api/upload）
 * - `POST /radio/assets`   新增素材；`DELETE /radio/assets/:id` 软删
 * - `POST /radio/turn`     生成下一段广播稿 → 解析成可执行片段
 * - `POST /radio/parse`    只解析（排查 / 前端调试）
 *
 * **纯台词**：模型只输出可直接念的文本 + 单独成行的记号；
 * 解析器再兜底洗掉括号旁白，保证 TTS 干净。
 * 故事台不走模型——直接把小说原文切成片段交给前端朗读，保证一字不改。
 */

const CHANNEL_IDS: RadioChannel[] = ['story', 'talk', 'music', 'pillow'];
const ASSET_KINDS = ['opener', 'bgm', 'se', 'drama', 'voice'];

function asChannel(v: unknown): RadioChannel {
  return CHANNEL_IDS.includes(v as RadioChannel) ? (v as RadioChannel) : 'talk';
}

function assetDTO(a: typeof radioAssets.$inferSelect) {
  return {
    id: a.id,
    channel: a.channel,
    kind: a.kind,
    name: a.name,
    url: a.url,
    meta: a.meta ? (() => {
      try {
        return JSON.parse(a.meta);
      } catch {
        return null;
      }
    })() : null,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt,
  };
}

export async function radioRoutes(app: FastifyInstance): Promise<void> {
  app.get('/radio/channels', async () => ({ channels: RADIO_CHANNELS }));

  app.get('/radio/assets', async (req) => {
    const { channel } = (req.query ?? {}) as { channel?: string };
    return db
      .select()
      .from(radioAssets)
      .all()
      .filter((a) => a.deletedAt == null && (!channel || a.channel === channel))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .map(assetDTO);
  });

  app.post('/radio/assets', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string;
      channel?: string;
      kind?: string;
      name?: string;
      url?: string;
      meta?: unknown;
      sortOrder?: number;
    };
    const name = body.name?.trim();
    const kind = ASSET_KINDS.includes(body.kind ?? '') ? body.kind! : '';
    if (!name || !kind) {
      reply.code(400).send({ message: 'name 与 kind 必填（kind: opener/bgm/se/drama/voice）' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(radioAssets)
      .values({
        id,
        channel: asChannel(body.channel),
        kind,
        name,
        url: body.url?.trim() || null,
        meta: body.meta ? JSON.stringify(body.meta) : null,
        sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.delete('/radio/assets/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(radioAssets).set({ deletedAt: ts, updatedAt: ts }).where(eq(radioAssets.id, id)).run();
    return { ok: true };
  });

  app.post('/radio/parse', async (req) => {
    const body = (req.body ?? {}) as { script?: string };
    return parseRadioScript(String(body.script ?? ''));
  });

  app.post('/radio/turn', async (req) => {
    const body = (req.body ?? {}) as {
      channel?: string;
      note?: string;
      history?: string;
      bookTitle?: string;
      chapterText?: string;
      mood?: string;
    };
    const channel = asChannel(body.channel);

    // 故事台：原文直读，一字不改，也不花 token
    if (channel === 'story') {
      const script = String(body.chapterText ?? '').trim();
      return {
        channel,
        script,
        ...parseRadioScript(script),
        source: 'local' as const,
      };
    }

    const context = radioUserContext({
      channel,
      note: body.note,
      history: body.history,
      bookTitle: body.bookTitle,
      chapterText: body.chapterText,
      mood: body.mood,
    });

    let script = '';
    let source: 'llm' | 'local' = 'local';
    try {
      const adapter = openaiCompatibleAdapter(getAdapterConfig());
      const model = getModelConfig().model;
      const res = await adapter.complete(
        {
          model,
          messages: [
            { role: 'system', content: radioChannelPrompt(channel) },
            { role: 'user', content: context },
          ],
          temperature: 0.9,
          maxTokens: 500,
        },
        { signal: AbortSignal.timeout(20_000) },
      );
      if (res.content?.trim()) {
        script = res.content.trim();
        source = 'llm';
      }
    } catch (err) {
      // 电台不能因为模型挂掉就哑掉：退回本地稿
      console.warn('[radio] 广播稿生成失败，使用本地稿：', (err as Error).message);
    }

    if (!script) {
      script = fallbackRadioScript(channel, body.note, body.bookTitle);
      source = 'local';
    }

    return {
      channel,
      script,
      ...parseRadioScript(script),
      source,
    };
  });
}
